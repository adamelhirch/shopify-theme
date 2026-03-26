#!/usr/bin/env ruby
# frozen_string_literal: true

require 'csv'
require 'fileutils'
require 'json'
require 'optparse'
require 'time'

DEFAULT_REVIEWS_PATH = File.expand_path('../data/custom-reviews-export.json', __dir__)
DEFAULT_REQUESTS_PATH = File.expand_path('../data/review-request-links.csv', __dir__)
DEFAULT_OUTPUT_PATH = File.expand_path('../data/reviews-admin-summary.json', __dir__)

class ReviewAdminDataGenerator
  def initialize(reviews_path:, requests_path:, output_path:)
    @reviews_path = reviews_path
    @requests_path = requests_path
    @output_path = output_path
  end

  def run
    reviews_payload = JSON.parse(File.read(@reviews_path))
    request_rows = CSV.read(@requests_path, headers: true).map(&:to_h)

    products = reviews_payload.fetch('products')
    all_reviews = products.flat_map do |product|
      product.fetch('reviews').map do |review|
        review.merge(
          'product_id' => product.fetch('id'),
          'product_handle' => product.fetch('handle'),
          'product_title' => product.fetch('title'),
          'product_online_store_url' => product['online_store_url'],
          'rating_average' => product['rating_average'],
          'rating_count' => product['rating_count']
        )
      end
    end

    summary = {
      generated_at: Time.now.utc.iso8601,
      store: reviews_payload['store'],
      overview: build_overview(products, all_reviews, request_rows),
      top_products: build_top_products(products),
      recent_reviews: build_recent_reviews(all_reviews),
      moderation_queue: build_moderation_queue(all_reviews),
      requests: build_requests(request_rows),
      widgets: build_widgets_snapshot(products),
      roadmap: build_roadmap_snapshot
    }

    FileUtils.mkdir_p(File.dirname(@output_path))
    File.write(@output_path, JSON.pretty_generate(summary))

    puts "Synthese admin generee: #{@output_path}"
    puts "- Avis total: #{summary.dig(:overview, :total_reviews)}"
    puts "- Produits notes: #{summary.dig(:overview, :reviewed_products)}"
  end

  private

  def build_overview(products, reviews, request_rows)
    verified_count = reviews.count { |review| review['verified'] == true }
    published_count = reviews.count { |review| !review['quote'].to_s.strip.empty? }
    total_reviews = reviews.size
    average_rating = if total_reviews.positive?
      reviews.sum { |review| review['rating'].to_f } / total_reviews
    else
      0
    end

    {
      total_reviews: total_reviews,
      average_rating: average_rating.round(2),
      verified_reviews: verified_count,
      reviewed_products: products.size,
      review_requests_ready: request_rows.size,
      published_reviews: published_count,
      pending_reviews: 0,
      qr_catalog_ready: request_rows.size.positive?
    }
  end

  def build_top_products(products)
    products
      .sort_by { |product| [-product.fetch('review_count'), -product.fetch('rating_average').to_f] }
      .first(10)
      .map do |product|
        {
          id: product['id'],
          title: product['title'],
          handle: product['handle'],
          url: product['online_store_url'],
          reviews: product['review_count'],
          rating: product['rating_average'] || 0,
          verified_reviews: product.fetch('reviews').count { |review| review['verified'] == true }
        }
      end
  end

  def build_recent_reviews(reviews)
    reviews
      .sort_by do |review|
        review['review_date'] ? Time.parse(review['review_date']) : Time.at(0)
      end
      .reverse
      .first(20)
      .map do |review|
        {
          author: review['author'],
          quote: review['quote'],
          rating: review['rating'],
          date: review['review_date'],
          product_title: review['product_title'],
          product_handle: review['product_handle'],
          verified: review['verified'] == true,
          source: review['source'] || 'Avis client'
        }
      end
  end

  def build_moderation_queue(reviews)
    reviews.first(20).map do |review|
      {
        author: review['author'],
        product_title: review['product_title'],
        rating: review['rating'],
        quote: review['quote'],
        date: review['review_date'],
        status: 'published',
        verified: review['verified'] == true,
        channel: 'historical_import'
      }
    end
  end

  def build_requests(request_rows)
    {
      total_products: request_rows.size,
      review_page_url: request_rows.first&.fetch('review_request_url', nil)&.split('?')&.first,
      samples: request_rows.first(20)
    }
  end

  def build_widgets_snapshot(products)
    [
      {
        key: 'star_rating_badge',
        name: 'Badge de notation produit',
        status: 'installed',
        description: 'Affiche la note moyenne et le nombre d avis sur les fiches et cartes produit.'
      },
      {
        key: 'product_reviews_section',
        name: 'Section avis produit',
        status: 'installed',
        description: 'Section custom alimentee par les metachamps maison du produit.'
      },
      {
        key: 'homepage_testimonials',
        name: 'Testimonials home',
        status: 'installed',
        description: 'Selection editoriale d avis avec produits relies.'
      },
      {
        key: 'review_request_page',
        name: 'Page de depot d avis',
        status: 'planned',
        description: 'Formulaire storefront pour recueillir un avis authentifie via token.'
      },
      {
        key: 'photo_video_reviews',
        name: 'Avis photo / video',
        status: 'planned',
        description: "Ajout de medias UGC au sein du futur workflow d'avis."
      }
    ]
  end

  def build_roadmap_snapshot
    [
      { module: 'Import historique', status: 'done' },
      { module: 'Snapshot base avis', status: 'done' },
      { module: 'Catalogue review links / QR', status: 'done' },
      { module: 'Metaobjects vd_review', status: 'next' },
      { module: 'Review requests post-achat', status: 'next' },
      { module: 'Moderation admin', status: 'next' },
      { module: 'Coupons / incentives', status: 'backlog' }
    ]
  end
end

options = {
  reviews_path: DEFAULT_REVIEWS_PATH,
  requests_path: DEFAULT_REQUESTS_PATH,
  output_path: DEFAULT_OUTPUT_PATH
}

OptionParser.new do |parser|
  parser.banner = 'Usage: ./bin/generate-review-admin-data.rb [options]'

  parser.on('--reviews PATH', 'Snapshot JSON des avis') do |value|
    options[:reviews_path] = File.expand_path(value)
  end

  parser.on('--requests PATH', 'CSV des review request links') do |value|
    options[:requests_path] = File.expand_path(value)
  end

  parser.on('--output PATH', 'JSON de synthese pour le backoffice') do |value|
    options[:output_path] = File.expand_path(value)
  end
end.parse!

ReviewAdminDataGenerator.new(
  reviews_path: options[:reviews_path],
  requests_path: options[:requests_path],
  output_path: options[:output_path]
).run
