#!/usr/bin/env ruby
# frozen_string_literal: true

require 'cgi'
require 'json'
require 'net/http'
require 'optparse'
require 'time'
require 'uri'

STORE = ENV.fetch('SHOPIFY_STORE', '4bru0c-p4.myshopify.com')
STOREFRONT_HOST = ENV.fetch('SHOPIFY_STOREFRONT_HOST', 'vanilledesire.com')
API_VERSION = ENV.fetch('SHOPIFY_API_VERSION', '2025-01')
PREVIEW_THEME_ID = ENV.fetch('SHOPIFY_QA_THEME_ID', '181079441675')
CONFIG_PATH = File.expand_path('~/Library/Preferences/shopify-cli-kit-nodejs/config.json')

PRODUCTS_QUERY = <<~GRAPHQL
  query ProductsForReviewMigration($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        reviewsRating: metafield(namespace: "reviews", key: "rating") {
          value
        }
        reviewsCount: metafield(namespace: "reviews", key: "rating_count") {
          value
        }
      }
    }
  }
GRAPHQL

METAFIELDS_SET_MUTATION = <<~GRAPHQL
  mutation SetReviewMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        namespace
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }
GRAPHQL

METAFIELD_DEFINITION_CREATE_MUTATION = <<~GRAPHQL
  mutation CreateDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }
GRAPHQL

class ShopifyAdminClient
  def initialize(store:, api_version:)
    @store = store
    @api_version = api_version
    @token = load_token
  end

  def graphql(query, variables = {})
    uri = URI("https://#{@store}/admin/api/#{@api_version}/graphql.json")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{@token}"
    request['Content-Type'] = 'application/json'
    request.body = JSON.generate({ query: query, variables: variables })

    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true) do |http|
      http.request(request)
    end

    payload = JSON.parse(response.body)
    if payload['errors']&.any?
      raise "Admin GraphQL error: #{payload['errors'].map { |error| error['message'] }.join(', ')}"
    end

    payload['data']
  end

  private

  def load_token
    config = JSON.parse(File.read(CONFIG_PATH))
    session_store = JSON.parse(config.fetch('sessionStore'))
    session = session_store.fetch('accounts.shopify.com').values.first
    session.fetch('identity').fetch('accessToken')
  end
end

class JudgeMeMigrator
  def initialize(store:, storefront_host:, preview_theme_id:, dry_run:, limit:)
    @store = store
    @storefront_host = storefront_host
    @preview_theme_id = preview_theme_id
    @dry_run = dry_run
    @limit = limit
    @client = ShopifyAdminClient.new(store: store, api_version: API_VERSION)
    @migrated = []
    @skipped = []
  end

  def run
    ensure_metafield_definitions

    products_to_migrate.each_with_index do |product, index|
      break if @limit && index >= @limit

      migrate_product(product)
    end

    puts
    puts "Migration terminee"
    puts "- Produits migrés : #{@migrated.size}"
    puts "- Produits ignorés : #{@skipped.size}"

    @migrated.each do |entry|
      puts "  • #{entry[:title]} -> #{entry[:review_count]} avis / #{entry[:payload_count]} affichables"
    end

    return if @skipped.empty?

    puts
    puts "Produits ignores"
    @skipped.each do |entry|
      puts "  • #{entry[:title]} -> #{entry[:reason]}"
    end
  end

  private

  def ensure_metafield_definitions
    definitions = [
      {
        name: 'VD Reviews JSON',
        namespace: 'custom',
        key: 'vd_reviews_json',
        description: 'Avis produits importes dans le systeme custom Vanille Desire.',
        ownerType: 'PRODUCT',
        type: 'json'
      },
      {
        name: 'VD Rating Average',
        namespace: 'custom',
        key: 'vd_rating_average',
        description: 'Note moyenne importee pour le systeme d avis custom.',
        ownerType: 'PRODUCT',
        type: 'number_decimal'
      },
      {
        name: 'VD Rating Count',
        namespace: 'custom',
        key: 'vd_rating_count',
        description: 'Nombre d avis importes pour le systeme d avis custom.',
        ownerType: 'PRODUCT',
        type: 'number_integer'
      }
    ]

    definitions.each do |definition|
      next if @dry_run

      data = @client.graphql(METAFIELD_DEFINITION_CREATE_MUTATION, { definition: definition })
      user_errors = data.dig('metafieldDefinitionCreate', 'userErrors') || []
      next if user_errors.empty?

      messages = user_errors.map { |error| error['message'] }
      next if messages.any? { |message| message.include?('already exists') }

      warn "Definition ignoree pour #{definition[:namespace]}.#{definition[:key]}: #{messages.join(', ')}"
    rescue StandardError => error
      next if error.message.include?('already exists')

      warn "Definition ignoree pour #{definition[:namespace]}.#{definition[:key]}: #{error.message}"
    end
  end

  def products_to_migrate
    cursor = nil
    products = []

    loop do
      data = @client.graphql(PRODUCTS_QUERY, { cursor: cursor })
      connection = data.fetch('products')
      nodes = connection.fetch('nodes')

      nodes.each do |product|
        count = product.dig('reviewsCount', 'value').to_i
        next unless count.positive?

        products << product
      end

      page_info = connection.fetch('pageInfo')
      break unless page_info.fetch('hasNextPage')

      cursor = page_info.fetch('endCursor')
    end

    products
  end

  def migrate_product(product)
    widget = fetch_widget_data(product)
    unless widget
      @skipped << { title: product.fetch('title'), reason: 'widget Judge.me introuvable' }
      return
    end

    payload = normalize_reviews(widget.fetch('reviews', []))
    average = extract_rating(product.dig('reviewsRating', 'value')) || widget.fetch('average_rating', '5.0').to_f
    review_count = product.dig('reviewsCount', 'value').to_i

    if @dry_run
      @migrated << {
        title: product.fetch('title'),
        review_count: review_count,
        payload_count: payload.size
      }
      return
    end

    metafields = [
      {
        ownerId: product.fetch('id'),
        namespace: 'custom',
        key: 'vd_reviews_json',
        type: 'json',
        value: JSON.generate(payload)
      },
      {
        ownerId: product.fetch('id'),
        namespace: 'custom',
        key: 'vd_rating_average',
        type: 'number_decimal',
        value: format('%.2f', average)
      },
      {
        ownerId: product.fetch('id'),
        namespace: 'custom',
        key: 'vd_rating_count',
        type: 'number_integer',
        value: review_count.to_s
      }
    ]

    data = @client.graphql(METAFIELDS_SET_MUTATION, { metafields: metafields })
    user_errors = data.dig('metafieldsSet', 'userErrors') || []
    if user_errors.any?
      raise "Impossible d enregistrer les avis pour #{product.fetch('title')}: #{user_errors.map { |error| error['message'] }.join(', ')}"
    end

    @migrated << {
      title: product.fetch('title'),
      review_count: review_count,
      payload_count: payload.size
    }
  rescue StandardError => error
    @skipped << { title: product.fetch('title'), reason: error.message }
  end

  def fetch_widget_data(product)
    handle = product.fetch('handle')
    numeric_id = product.fetch('id').split('/').last
    urls = [
      "https://#{@storefront_host}/products/#{handle}",
      "https://#{@store}/products/#{handle}?preview_theme_id=#{@preview_theme_id}"
    ]

    urls.each do |url|
      html = Net::HTTP.get(URI(url))
      script_match = html.match(%r{<script class=['"]jdgm-review-widget-data['"]>\s*(.*?)\s*</script>}m)
      next unless script_match

      script_content = CGI.unescapeHTML(script_match[1])
      data_match = script_content.match(/jdgm\.data\.reviewWidget\[#{Regexp.escape(numeric_id)}\]\s*=\s*(\{.*\})\s*;?/m)
      next unless data_match

      return JSON.parse(data_match[1])
    end

    nil
  end

  def normalize_reviews(reviews)
    reviews.each_with_object([]) do |review, collection|
      quote = [review['title'], review['body']].compact.map(&:strip).reject(&:empty?).join("\n")
      quote = 'Avis laisse sans commentaire.' if quote.empty?

      collection << {
        'legacy_uuid' => review['uuid'],
        'quote' => quote,
        'author' => review['reviewer_name'].to_s.strip.empty? ? 'Client' : review['reviewer_name'].to_s.strip,
        'rating' => review['rating'].to_i,
        'review_date' => extract_date(review['created_at']),
        'context' => nil,
        'product_title' => review['product_title'],
        'product_url' => review['product_url'],
        'source' => 'Avis client',
        'verified' => !!review['verified_buyer']
      }
    end
  end

  def extract_date(value)
    return nil if value.to_s.strip.empty?

    Time.parse(value).utc.strftime('%Y-%m-%d')
  rescue ArgumentError
    nil
  end

  def extract_rating(value)
    return nil if value.to_s.strip.empty?

    parsed = JSON.parse(value)
    parsed.fetch('value').to_f
  rescue JSON::ParserError, KeyError
    nil
  end
end

options = {
  dry_run: false,
  limit: nil
}

OptionParser.new do |parser|
  parser.banner = 'Usage: ./bin/migrate-judgeme-reviews.rb [options]'

  parser.on('--dry-run', 'Analyse sans ecriture Shopify') do
    options[:dry_run] = true
  end

  parser.on('--limit N', Integer, 'Limiter le nombre de produits migrés') do |limit|
    options[:limit] = limit
  end
end.parse!

JudgeMeMigrator.new(
  store: STORE,
  storefront_host: STOREFRONT_HOST,
  preview_theme_id: PREVIEW_THEME_ID,
  dry_run: options[:dry_run],
  limit: options[:limit]
).run
