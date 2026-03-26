#!/usr/bin/env ruby
# frozen_string_literal: true

require 'csv'
require 'fileutils'
require 'json'
require 'securerandom'
require 'time'

class ReviewsStore
  DEFAULT_DB_PATH = File.expand_path('../../../data/reviews-app-store.json', __dir__)
  DEFAULT_SNAPSHOT_PATH = File.expand_path('../../../data/custom-reviews-export.json', __dir__)
  DEFAULT_REQUESTS_PATH = File.expand_path('../../../data/review-request-links.csv', __dir__)

  def initialize(db_path: DEFAULT_DB_PATH, snapshot_path: DEFAULT_SNAPSHOT_PATH, requests_path: DEFAULT_REQUESTS_PATH)
    @db_path = db_path
    @snapshot_path = snapshot_path
    @requests_path = requests_path
    @state = load_state
  end

  def dashboard
    published_reviews = @state.fetch('reviews').select { |review| review['status'] == 'published' }
    total_reviews = published_reviews.size
    average_rating = if total_reviews.positive?
      published_reviews.sum { |review| review['rating'].to_f } / total_reviews
    else
      0
    end

    {
      generated_at: Time.now.utc.iso8601,
      overview: {
        total_reviews: total_reviews,
        pending_reviews: @state.fetch('reviews').count { |review| review['status'] == 'pending' },
        verified_reviews: published_reviews.count { |review| review['verified'] == true },
        average_rating: average_rating.round(2),
        review_requests: @state.fetch('review_requests').size
      },
      recent_reviews: recent_reviews,
      top_products: top_products
    }
  end

  def list_reviews(status: nil)
    reviews = @state.fetch('reviews')
    reviews = reviews.select { |review| review['status'] == status } if status && !status.empty?
    reviews.sort_by { |review| parse_time(review['submitted_at']) || Time.at(0) }.reverse
  end

  def list_requests(state: nil)
    requests = @state.fetch('review_requests')
    requests = requests.select { |request| request['state'] == state } if state && !state.empty?
    requests.sort_by { |request| parse_time(request['created_at']) || Time.at(0) }.reverse
  end

  def submit_review(payload)
    now = Time.now.utc.iso8601
    matched_request = find_request(payload['token'], payload['product_handle'])
    verified = matched_request ? true : false
    verification_method = matched_request ? 'token_match' : 'manual'
    status = auto_publish?(verified) ? 'published' : 'pending'

    review = {
      'id' => generate_id('review'),
      'legacy_uuid' => nil,
      'author' => present_or_default(payload['author'], 'Client'),
      'email' => payload['email'].to_s.strip,
      'order_name' => payload['order_name'].to_s.strip,
      'title' => payload['title'].to_s.strip,
      'quote' => payload['quote'].to_s.strip,
      'context' => payload['context'].to_s.strip,
      'rating' => normalize_rating(payload['rating']),
      'review_date' => Time.now.utc.strftime('%Y-%m-%d'),
      'submitted_at' => now,
      'source' => 'Avis client',
      'status' => status,
      'verified' => verified,
      'verification_method' => verification_method,
      'product_handle' => payload['product_handle'].to_s.strip,
      'product_title' => resolve_product_title(payload['product_handle']),
      'product_url' => resolve_product_url(payload['product_handle']),
      'reply' => nil,
      'reply_at' => nil,
      'channel' => matched_request ? matched_request['channel'] : 'storefront_form',
      'token' => payload['token'].to_s.strip
    }

    @state.fetch('reviews') << review

    if matched_request
      matched_request['state'] = 'submitted'
      matched_request['submitted_review_id'] = review['id']
      matched_request['submitted_at'] = now
    end

    persist!
    review
  end

  def moderate_review(review_id, status)
    review = @state.fetch('reviews').find { |entry| entry['id'] == review_id }
    raise "Review not found: #{review_id}" unless review

    review['status'] = status.to_s
    review['moderated_at'] = Time.now.utc.iso8601
    persist!
    review
  end

  def respond_to_review(review_id, reply)
    review = @state.fetch('reviews').find { |entry| entry['id'] == review_id }
    raise "Review not found: #{review_id}" unless review

    review['reply'] = reply.to_s.strip
    review['reply_at'] = Time.now.utc.iso8601
    persist!
    review
  end

  def create_review_request(payload)
    request = {
      'id' => generate_id('request'),
      'token' => SecureRandom.hex(16),
      'product_handle' => payload.fetch('product_handle'),
      'product_title' => resolve_product_title(payload['product_handle']),
      'product_url' => resolve_product_url(payload['product_handle']),
      'customer_email' => payload['customer_email'].to_s.strip,
      'order_name' => payload['order_name'].to_s.strip,
      'state' => 'queued',
      'channel' => payload['channel'].to_s.strip.empty? ? 'manual' : payload['channel'].to_s.strip,
      'created_at' => Time.now.utc.iso8601,
      'expires_at' => payload['expires_at'].to_s.strip.empty? ? nil : payload['expires_at'].to_s.strip,
      'landing_url' => build_landing_url(payload.fetch('product_handle'))
    }

    @state.fetch('review_requests') << request
    persist!
    request
  end

  def storefront_payload_by_product
    published_reviews = @state.fetch('reviews').select { |review| review['status'] == 'published' }

    published_reviews.each_with_object({}) do |review, hash|
      handle = review['product_handle'].to_s.strip
      next if handle.empty?

      hash[handle] ||= []
      hash[handle] << storefront_review(review)
    end
  end

  private

  def load_state
    return JSON.parse(File.read(@db_path)) if File.exist?(@db_path)

    bootstrap_state
  end

  def bootstrap_state
    state = {
      'settings' => {
        'auto_publish_verified' => true,
        'auto_publish_unverified' => false,
        'review_page_url' => 'https://vanilledesire.com/pages/review-request'
      },
      'reviews' => [],
      'review_requests' => [],
      'products' => {}
    }

    if File.exist?(@snapshot_path)
      snapshot = JSON.parse(File.read(@snapshot_path))
      snapshot.fetch('products', []).each do |product|
        handle = product.fetch('handle')
        state['products'][handle] = {
          'id' => product['id'],
          'title' => product['title'],
          'handle' => handle,
          'url' => product['online_store_url']
        }

        product.fetch('reviews', []).each do |review|
          state['reviews'] << {
            'id' => generate_id('review'),
            'legacy_uuid' => review['legacy_uuid'],
            'author' => review['author'],
            'email' => nil,
            'order_name' => nil,
            'title' => nil,
            'quote' => review['quote'],
            'context' => review['context'],
            'rating' => review['rating'],
            'review_date' => review['review_date'],
            'submitted_at' => review['review_date'],
            'source' => review['source'] || 'Avis client',
            'status' => 'published',
            'verified' => review['verified'] == true,
            'verification_method' => review['verified'] == true ? 'historical_verified_buyer' : 'historical_import',
            'product_handle' => handle,
            'product_title' => review['product_title'] || product['title'],
            'product_url' => review['product_url'] || product['online_store_url'],
            'reply' => nil,
            'reply_at' => nil,
            'channel' => 'historical_import',
            'token' => nil
          }
        end
      end
    end

    if File.exist?(@requests_path)
      CSV.read(@requests_path, headers: true).each do |row|
        handle = row['handle'].to_s.strip
        next if handle.empty?

        state['products'][handle] ||= {
          'id' => row['product_id'],
          'title' => row['title'],
          'handle' => handle,
          'url' => row['product_url']
        }

        state['review_requests'] << {
          'id' => generate_id('request'),
          'token' => SecureRandom.hex(16),
          'product_handle' => handle,
          'product_title' => row['title'],
          'product_url' => row['product_url'],
          'customer_email' => nil,
          'order_name' => nil,
          'state' => 'queued',
          'channel' => 'qr_catalog',
          'created_at' => Time.now.utc.iso8601,
          'expires_at' => nil,
          'landing_url' => row['review_request_url']
        }
      end
    end

    FileUtils.mkdir_p(File.dirname(@db_path))
    File.write(@db_path, JSON.pretty_generate(state))
    state
  end

  def persist!
    FileUtils.mkdir_p(File.dirname(@db_path))
    File.write(@db_path, JSON.pretty_generate(@state))
  end

  def generate_id(prefix)
    "#{prefix}_#{SecureRandom.hex(8)}"
  end

  def normalize_rating(value)
    rating = value.to_i
    return 5 if rating > 5
    return 1 if rating < 1

    rating
  end

  def auto_publish?(verified)
    return true if verified && @state.dig('settings', 'auto_publish_verified')

    !!@state.dig('settings', 'auto_publish_unverified')
  end

  def present_or_default(value, fallback)
    cleaned = value.to_s.strip
    cleaned.empty? ? fallback : cleaned
  end

  def resolve_product_title(handle)
    @state.dig('products', handle.to_s.strip, 'title') || handle.to_s.strip
  end

  def resolve_product_url(handle)
    @state.dig('products', handle.to_s.strip, 'url')
  end

  def find_request(token, product_handle)
    token = token.to_s.strip
    handle = product_handle.to_s.strip
    return nil if token.empty? || handle.empty?

    @state.fetch('review_requests').find do |request|
      request['token'] == token && request['product_handle'] == handle
    end
  end

  def build_landing_url(handle)
    base = @state.dig('settings', 'review_page_url')
    token = SecureRandom.hex(16)
    "#{base}?product=#{handle}&token=#{token}"
  end

  def parse_time(value)
    return nil if value.to_s.strip.empty?

    Time.parse(value)
  rescue ArgumentError
    nil
  end

  def recent_reviews
    list_reviews.first(10).map do |review|
      {
        id: review['id'],
        author: review['author'],
        quote: review['quote'],
        rating: review['rating'],
        date: review['review_date'],
        product_title: review['product_title'],
        verified: review['verified'] == true,
        status: review['status']
      }
    end
  end

  def top_products
    grouped = storefront_payload_by_product

    grouped.map do |handle, reviews|
      total = reviews.size
      average = reviews.sum { |review| review.fetch('rating').to_f } / total
      {
        handle: handle,
        title: resolve_product_title(handle),
        url: resolve_product_url(handle),
        reviews: total,
        rating: average.round(2)
      }
    end.sort_by { |entry| [-entry[:reviews], -entry[:rating]] }.first(10)
  end

  def storefront_review(review)
    {
      'legacy_uuid' => review['legacy_uuid'],
      'quote' => review['quote'],
      'author' => review['author'],
      'rating' => review['rating'],
      'review_date' => review['review_date'],
      'context' => review['context'],
      'product_title' => review['product_title'],
      'product_url' => review['product_url'],
      'source' => review['source'],
      'verified' => review['verified'] == true
    }
  end
end
