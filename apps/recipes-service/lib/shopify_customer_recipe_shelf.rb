require 'json'
require 'net/http'
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

  def sync(email:, favorites:, history:, actor:)
    raise ArgumentError, configuration_errors.join(', ') unless configured?

    normalized_email = email.to_s.strip.downcase
    raise ArgumentError, 'email client manquant' if normalized_email.empty?

    customer = find_customer_by_email(normalized_email)
    raise KeyError, 'customer not found' unless customer

    now = Time.now.utc.iso8601
    favorite_payload = {
      'slugs' => normalize_slugs(favorites),
      'updated_at' => now,
      'updated_by' => actor.to_s
    }
    history_payload = {
      'items' => normalize_history(history, now),
      'updated_at' => now,
      'updated_by' => actor.to_s
    }

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
      customer: {
        id: customer['id'],
        email: customer['email'],
        first_name: customer['firstName'],
        last_name: customer['lastName']
      },
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

  def normalize_slugs(values)
    Array(values).map { |value| value.to_s.strip }.reject(&:empty?).uniq.first(24)
  end

  def normalize_history(values, timestamp)
    normalize_slugs(values).map do |slug|
      { 'slug' => slug, 'saved_at' => timestamp }
    end
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
