require 'json'
require 'net/http'
require 'time'
require 'uri'

class ShopifyCustomerRecipeShelf
  DEFAULT_API_VERSION = '2025-10'.freeze

  CUSTOMER_LOOKUP_QUERY = <<~GRAPHQL.freeze
    query CustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        nodes {
          id
          email
          firstName
          lastName
        }
      }
    }
  GRAPHQL

  CUSTOMER_BY_ID_QUERY = <<~GRAPHQL.freeze
    query CustomerById($id: ID!) {
      customer(id: $id) {
        id
        email
        firstName
        lastName
        recipeFavorites: metafield(namespace: "vd", key: "recipe_favorites") {
          value
          updatedAt
        }
        recipeHistory: metafield(namespace: "vd", key: "recipe_history") {
          value
          updatedAt
        }
      }
    }
  GRAPHQL

  METAFIELDS_SET_MUTATION = <<~GRAPHQL.freeze
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          namespace
          value
          updatedAt
        }
        userErrors {
          field
          message
        }
      }
    }
  GRAPHQL

  def self.build_from_env
    new(
      shop_domain: ENV['VD_RECIPES_SHOPIFY_STORE'] || ENV['SHOPIFY_STORE'] || '',
      access_token: ENV['VD_RECIPES_SHOPIFY_ADMIN_TOKEN'] || ENV['SHOPIFY_ADMIN_ACCESS_TOKEN'] || '',
      api_version: ENV['VD_RECIPES_SHOPIFY_API_VERSION'] || ENV['SHOPIFY_API_VERSION'] || DEFAULT_API_VERSION
    )
  end

  attr_reader :shop_domain, :api_version

  def initialize(shop_domain:, access_token:, api_version: DEFAULT_API_VERSION)
    @shop_domain = shop_domain.to_s.strip
    @access_token = access_token.to_s.strip
    @api_version = api_version.to_s.strip.empty? ? DEFAULT_API_VERSION : api_version.to_s.strip
  end

  def configured?
    configuration_errors.empty?
  end

  def configuration_errors
    errors = []
    errors << 'VD_RECIPES_SHOPIFY_STORE ou SHOPIFY_STORE manquant' if shop_domain.empty?
    errors << 'VD_RECIPES_SHOPIFY_ADMIN_TOKEN ou SHOPIFY_ADMIN_ACCESS_TOKEN manquant' if @access_token.empty?
    errors
  end

  def fetch(customer_id: nil, email: nil)
    raise ArgumentError, configuration_errors.join(', ') unless configured?

    customer = resolve_customer(customer_id: customer_id, email: email)
    raise KeyError, 'customer not found' unless customer

    {
      ok: true,
      customer: public_customer(customer),
      favorites: parse_metafield_json(customer['recipeFavorites'], fallback: { 'slugs' => [] }),
      history: parse_metafield_json(customer['recipeHistory'], fallback: { 'items' => [] }),
      shop_domain: shop_domain,
      api_version: api_version
    }
  end

  def sync(customer_id: nil, email: nil, favorites:, history:, actor:)
    raise ArgumentError, configuration_errors.join(', ') unless configured?

    customer = resolve_customer(customer_id: customer_id, email: email)
    raise KeyError, 'customer not found' unless customer

    now = Time.now.utc.iso8601
    favorite_payload = normalize_favorites_payload(favorites, now, actor)
    history_payload = normalize_history_payload(history, now, actor)

    payload = graphql(
      METAFIELDS_SET_MUTATION,
      {
        metafields: [
          {
            ownerId: customer.fetch('id'),
            namespace: 'vd',
            key: 'recipe_favorites',
            type: 'json',
            value: JSON.generate(favorite_payload)
          },
          {
            ownerId: customer.fetch('id'),
            namespace: 'vd',
            key: 'recipe_history',
            type: 'json',
            value: JSON.generate(history_payload)
          }
        ]
      }
    ).fetch('metafieldsSet')

    user_errors = Array(payload['userErrors']).map { |entry| entry['message'] }.reject(&:to_s.empty?)
    raise ArgumentError, user_errors.join(', ') unless user_errors.empty?

    {
      ok: true,
      customer: public_customer(customer),
      favorites: favorite_payload,
      history: history_payload,
      updated_at: now,
      shop_domain: shop_domain,
      api_version: api_version
    }
  end

  private

  def find_customer_by_email(email)
    payload = graphql(CUSTOMER_LOOKUP_QUERY, { query: "email:#{email}" })
    Array(payload.dig('customers', 'nodes')).first
  end

  def find_customer_by_id(customer_id)
    gid = customer_id.to_s.start_with?('gid://') ? customer_id.to_s : "gid://shopify/Customer/#{customer_id}"
    payload = graphql(CUSTOMER_BY_ID_QUERY, { id: gid })
    payload['customer']
  end

  def resolve_customer(customer_id:, email:)
    normalized_email = email.to_s.strip.downcase
    return find_customer_by_id(customer_id) unless customer_id.to_s.strip.empty?
    raise ArgumentError, 'email client manquant' if normalized_email.empty?

    find_customer_by_email(normalized_email)
  end

  def parse_metafield_json(entry, fallback:)
    return fallback unless entry.is_a?(Hash)

    JSON.parse(entry['value'].to_s)
  rescue JSON::ParserError
    fallback
  end

  def public_customer(customer)
    {
      id: customer['id'],
      email: customer['email'],
      first_name: customer['firstName'],
      last_name: customer['lastName']
    }
  end

  def normalize_slugs(values)
    Array(values).map { |value| value.to_s.strip }.reject(&:empty?).uniq.first(24)
  end

  def normalize_favorites_payload(values, timestamp, actor)
    source = values.is_a?(Hash) ? values : {}
    {
      'slugs' => normalize_slugs(source['slugs'] || source[:slugs] || values),
      'updated_at' => normalize_timestamp(source['updated_at'] || source[:updated_at], timestamp),
      'updated_by' => source['updated_by'].to_s.strip.empty? ? actor.to_s : source['updated_by'].to_s
    }
  end

  def normalize_history_payload(values, timestamp, actor)
    source = values.is_a?(Hash) ? values : {}
    {
      'items' => normalize_history_items(source['items'] || source[:items] || values, timestamp),
      'updated_at' => normalize_timestamp(source['updated_at'] || source[:updated_at], timestamp),
      'updated_by' => source['updated_by'].to_s.strip.empty? ? actor.to_s : source['updated_by'].to_s
    }
  end

  def normalize_history_items(values, timestamp)
    Array(values).each_with_object([]) do |entry, items|
      normalized =
        if entry.is_a?(Hash)
          slug = entry['slug'].to_s.strip
          next if slug.empty?

          {
            'slug' => slug,
            'saved_at' => normalize_timestamp(entry['saved_at'] || entry[:saved_at] || entry['at'] || entry[:at], timestamp)
          }
        else
          slug = entry.to_s.strip
          next if slug.empty?

          { 'slug' => slug, 'saved_at' => timestamp }
        end

      next if items.any? { |item| item['slug'] == normalized['slug'] }

      items << normalized
    end.first(24)
  end

  def normalize_timestamp(value, fallback)
    candidate = value.to_s.strip
    return fallback if candidate.empty?

    Time.parse(candidate).utc.iso8601
  rescue ArgumentError
    fallback
  end

  def graphql(query, variables = {})
    uri = URI("https://#{shop_domain}/admin/api/#{api_version}/graphql.json")
    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    request['X-Shopify-Access-Token'] = @access_token
    request.body = JSON.generate(query: query, variables: variables)

    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true) do |http|
      http.request(request)
    end

    payload = JSON.parse(response.body)
    raise ArgumentError, payload['errors'].map { |entry| entry['message'] }.join(', ') if payload['errors']
    raise ArgumentError, "Shopify API error HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    payload.fetch('data')
  end
end
