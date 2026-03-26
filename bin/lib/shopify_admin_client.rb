#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'

class ShopifyAdminClient
  DEFAULT_CONFIG_PATH = File.expand_path('~/Library/Preferences/shopify-cli-kit-nodejs/config.json')

  def initialize(store:, api_version:, config_path: DEFAULT_CONFIG_PATH)
    @store = store
    @api_version = api_version
    @config_path = config_path
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
      message = payload['errors'].map { |error| error['message'] }.join(', ')
      raise "Admin GraphQL error: #{message}"
    end

    payload.fetch('data')
  end

  private

  def load_token
    config = JSON.parse(File.read(@config_path))
    session_store = JSON.parse(config.fetch('sessionStore'))
    session = session_store.fetch('accounts.shopify.com').values.first
    session.fetch('identity').fetch('accessToken')
  end
end
