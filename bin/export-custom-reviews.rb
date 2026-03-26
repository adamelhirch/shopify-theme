#!/usr/bin/env ruby
# frozen_string_literal: true

require 'fileutils'
require 'json'
require 'optparse'
require 'time'

require_relative 'lib/shopify_admin_client'

STORE = ENV.fetch('SHOPIFY_STORE', '4bru0c-p4.myshopify.com')
API_VERSION = ENV.fetch('SHOPIFY_API_VERSION', '2025-01')
DEFAULT_OUTPUT = File.expand_path('../data/custom-reviews-export.json', __dir__)

PRODUCTS_QUERY = <<~GRAPHQL
  query ProductsForCustomReviewExport($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        onlineStoreUrl
        ratingAverage: metafield(namespace: "custom", key: "vd_rating_average") {
          value
        }
        ratingCount: metafield(namespace: "custom", key: "vd_rating_count") {
          value
        }
        reviewsJson: metafield(namespace: "custom", key: "vd_reviews_json") {
          value
        }
      }
    }
  }
GRAPHQL

class CustomReviewsExporter
  def initialize(output:, limit:)
    @output = output
    @limit = limit
    @client = ShopifyAdminClient.new(store: STORE, api_version: API_VERSION)
  end

  def run
    exported_products = fetch_products
    payload = {
      exported_at: Time.now.utc.iso8601,
      store: STORE,
      product_count: exported_products.size,
      review_count: exported_products.sum { |product| product.fetch(:review_count) },
      products: exported_products
    }

    FileUtils.mkdir_p(File.dirname(@output))
    File.write(@output, JSON.pretty_generate(payload))

    puts "Export termine: #{@output}"
    puts "- Produits avec avis: #{payload[:product_count]}"
    puts "- Avis exportes: #{payload[:review_count]}"
  end

  private

  def fetch_products
    cursor = nil
    exported = []

    loop do
      data = @client.graphql(PRODUCTS_QUERY, { cursor: cursor })
      connection = data.fetch('products')

      connection.fetch('nodes').each do |product|
        reviews_value = product.dig('reviewsJson', 'value')
        next if reviews_value.to_s.strip.empty?

        reviews = parse_reviews(reviews_value)
        next if reviews.empty?

        exported << {
          id: product.fetch('id'),
          title: product.fetch('title'),
          handle: product.fetch('handle'),
          online_store_url: product['onlineStoreUrl'],
          rating_average: product.dig('ratingAverage', 'value')&.to_f,
          rating_count: product.dig('ratingCount', 'value')&.to_i,
          review_count: reviews.size,
          reviews: reviews
        }

        break if @limit && exported.size >= @limit
      end

      break if @limit && exported.size >= @limit

      page_info = connection.fetch('pageInfo')
      break unless page_info.fetch('hasNextPage')

      cursor = page_info.fetch('endCursor')
    end

    exported
  end

  def parse_reviews(value)
    JSON.parse(value)
  rescue JSON::ParserError
    []
  end
end

options = {
  output: DEFAULT_OUTPUT,
  limit: nil
}

OptionParser.new do |parser|
  parser.banner = 'Usage: ./bin/export-custom-reviews.rb [options]'

  parser.on('--output PATH', 'Chemin du fichier JSON exporte') do |output|
    options[:output] = File.expand_path(output)
  end

  parser.on('--limit N', Integer, 'Limiter le nombre de produits exportes') do |limit|
    options[:limit] = limit
  end
end.parse!

CustomReviewsExporter.new(
  output: options[:output],
  limit: options[:limit]
).run
