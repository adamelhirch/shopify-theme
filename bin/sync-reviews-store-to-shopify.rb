#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'optparse'

require_relative 'lib/shopify_admin_client'

STORE = ENV.fetch('SHOPIFY_STORE', '4bru0c-p4.myshopify.com')
API_VERSION = ENV.fetch('SHOPIFY_API_VERSION', '2025-01')
DEFAULT_STORE_PATH = File.expand_path('../data/reviews-app-store.json', __dir__)

PRODUCTS_QUERY = <<~GRAPHQL
  query ProductsForReviewSync($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        handle
        title
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

class ReviewsStoreSync
  def initialize(store_path:, dry_run:)
    @store_path = store_path
    @dry_run = dry_run
    @client = ShopifyAdminClient.new(store: STORE, api_version: API_VERSION)
  end

  def run
    state = JSON.parse(File.read(@store_path))
    reviews_by_handle = published_reviews_by_handle(state.fetch('reviews'))
    products = fetch_products

    synced = 0
    skipped = 0

    products.each do |product|
      reviews = reviews_by_handle[product.fetch('handle')] || []
      next if reviews.empty?

      average = reviews.sum { |review| review.fetch('rating').to_f } / reviews.size
      metafields = [
        {
          ownerId: product.fetch('id'),
          namespace: 'custom',
          key: 'vd_reviews_json',
          type: 'json',
          value: JSON.generate(reviews.map { |review| storefront_review(review) })
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
          value: reviews.size.to_s
        }
      ]

      if @dry_run
        puts "[dry-run] #{product.fetch('title')} -> #{reviews.size} avis"
      else
        result = @client.graphql(METAFIELDS_SET_MUTATION, { metafields: metafields })
        errors = result.dig('metafieldsSet', 'userErrors') || []
        if errors.any?
          warn "Sync ignoree pour #{product.fetch('title')}: #{errors.map { |error| error['message'] }.join(', ')}"
          skipped += 1
          next
        end
      end

      synced += 1
    end

    puts "Sync reviews terminee"
    puts "- Produits synchronises: #{synced}"
    puts "- Produits ignores: #{skipped}"
  end

  private

  def fetch_products
    cursor = nil
    products = []

    loop do
      data = @client.graphql(PRODUCTS_QUERY, { cursor: cursor })
      connection = data.fetch('products')
      products.concat(connection.fetch('nodes'))
      page_info = connection.fetch('pageInfo')
      break unless page_info.fetch('hasNextPage')

      cursor = page_info.fetch('endCursor')
    end

    products
  end

  def published_reviews_by_handle(reviews)
    reviews.each_with_object({}) do |review, hash|
      next unless review['status'] == 'published'

      handle = review['product_handle'].to_s.strip
      next if handle.empty?

      hash[handle] ||= []
      hash[handle] << review
    end
  end

  def storefront_review(review)
    {
      legacy_uuid: review['legacy_uuid'],
      quote: review['quote'],
      author: review['author'],
      rating: review['rating'],
      review_date: review['review_date'],
      context: review['context'],
      product_title: review['product_title'],
      product_url: review['product_url'],
      source: review['source'],
      verified: review['verified'] == true
    }
  end
end

options = {
  store_path: DEFAULT_STORE_PATH,
  dry_run: false
}

OptionParser.new do |parser|
  parser.banner = 'Usage: ./bin/sync-reviews-store-to-shopify.rb [options]'

  parser.on('--store PATH', 'Chemin du store reviews local') do |value|
    options[:store_path] = File.expand_path(value)
  end

  parser.on('--dry-run', 'Simulation sans ecriture Shopify') do
    options[:dry_run] = true
  end
end.parse!

ReviewsStoreSync.new(
  store_path: options[:store_path],
  dry_run: options[:dry_run]
).run
