#!/usr/bin/env ruby
# frozen_string_literal: true

require 'csv'
require 'fileutils'
require 'optparse'
require 'uri'

require_relative 'lib/shopify_admin_client'

STORE = ENV.fetch('SHOPIFY_STORE', '4bru0c-p4.myshopify.com')
API_VERSION = ENV.fetch('SHOPIFY_API_VERSION', '2025-01')
DEFAULT_OUTPUT = File.expand_path('../data/review-request-links.csv', __dir__)
DEFAULT_REVIEW_PAGE_URL = ENV.fetch('VD_REVIEW_PAGE_URL', 'https://vanilledesire.com/pages/review-request')

PRODUCTS_QUERY = <<~GRAPHQL
  query ProductsForReviewLinks($cursor: String) {
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
      }
    }
  }
GRAPHQL

class ReviewRequestLinksBuilder
  def initialize(output:, review_page_url:, limit:)
    @output = output
    @review_page_url = review_page_url
    @limit = limit
    @client = ShopifyAdminClient.new(store: STORE, api_version: API_VERSION)
  end

  def run
    rows = build_rows

    FileUtils.mkdir_p(File.dirname(@output))
    CSV.open(@output, 'w') do |csv|
      csv << %w[product_id title handle product_url review_request_url]
      rows.each do |row|
        csv << row.values_at(:product_id, :title, :handle, :product_url, :review_request_url)
      end
    end

    puts "Liens QR / review request generes: #{@output}"
    puts "- Produits exportes: #{rows.size}"
    puts "- Base review page: #{@review_page_url}"
  end

  private

  def build_rows
    cursor = nil
    rows = []

    loop do
      data = @client.graphql(PRODUCTS_QUERY, { cursor: cursor })
      connection = data.fetch('products')

      connection.fetch('nodes').each do |product|
        rows << {
          product_id: product.fetch('id'),
          title: product.fetch('title'),
          handle: product.fetch('handle'),
          product_url: product['onlineStoreUrl'],
          review_request_url: build_review_request_url(product.fetch('handle'))
        }

        break if @limit && rows.size >= @limit
      end

      break if @limit && rows.size >= @limit

      page_info = connection.fetch('pageInfo')
      break unless page_info.fetch('hasNextPage')

      cursor = page_info.fetch('endCursor')
    end

    rows
  end

  def build_review_request_url(handle)
    uri = URI(@review_page_url)
    params = URI.decode_www_form(String(uri.query))
    params << ['product', handle]
    uri.query = URI.encode_www_form(params)
    uri.to_s
  end
end

options = {
  output: DEFAULT_OUTPUT,
  review_page_url: DEFAULT_REVIEW_PAGE_URL,
  limit: nil
}

OptionParser.new do |parser|
  parser.banner = 'Usage: ./bin/build-review-request-links.rb [options]'

  parser.on('--output PATH', 'Chemin du CSV exporte') do |output|
    options[:output] = File.expand_path(output)
  end

  parser.on('--review-page-url URL', 'URL de la future page de depot d avis') do |url|
    options[:review_page_url] = url
  end

  parser.on('--limit N', Integer, 'Limiter le nombre de produits exportes') do |limit|
    options[:limit] = limit
  end
end.parse!

ReviewRequestLinksBuilder.new(
  output: options[:output],
  review_page_url: options[:review_page_url],
  limit: options[:limit]
).run
