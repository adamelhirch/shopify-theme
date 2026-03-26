#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'

require_relative 'lib/shopify_admin_client'

STORE = ENV.fetch('SHOPIFY_STORE', '4bru0c-p4.myshopify.com')
API_VERSION = ENV.fetch('SHOPIFY_API_VERSION', '2025-01')

METAOBJECT_DEFINITIONS_QUERY = <<~GRAPHQL
  query MetaobjectDefinitions($first: Int!) {
    metaobjectDefinitions(first: $first) {
      nodes {
        id
        type
        name
      }
    }
  }
GRAPHQL

METAOBJECT_DEFINITION_CREATE_MUTATION = <<~GRAPHQL
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
        name
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
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        namespace
        key
        type {
          name
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
GRAPHQL

class ReviewsMetaobjectsBootstrap
  def initialize
    @client = ShopifyAdminClient.new(store: STORE, api_version: API_VERSION)
  end

  def run
    existing = fetch_existing_definitions

    review_definition = ensure_metaobject_definition(existing, review_definition_input)
    request_definition = ensure_metaobject_definition(existing, request_definition_input)
    qr_definition = ensure_metaobject_definition(existing, qr_definition_input)

    ensure_product_metafield_definition('vd_reviews', review_definition.fetch('id'))
    ensure_product_metafield_definition('vd_review_requests', request_definition.fetch('id'))
    ensure_decimal_metafield_definition('vd_rating_average', 'VD Rating Average')
    ensure_integer_metafield_definition('vd_rating_count', 'VD Rating Count')

    puts 'Bootstrap reviews Shopify termine'
    puts "- Metaobject vd_review: #{review_definition.fetch('id')}"
    puts "- Metaobject vd_review_request: #{request_definition.fetch('id')}"
    puts "- Metaobject vd_review_qr: #{qr_definition.fetch('id')}"
  end

  private

  def fetch_existing_definitions
    data = @client.graphql(METAOBJECT_DEFINITIONS_QUERY, { first: 100 })
    data.fetch('metaobjectDefinitions').fetch('nodes').each_with_object({}) do |definition, hash|
      hash[definition.fetch('type')] = definition
    end
  end

  def ensure_metaobject_definition(existing, definition)
    type = definition.fetch(:type)
    return existing[type] if existing.key?(type)

    data = @client.graphql(METAOBJECT_DEFINITION_CREATE_MUTATION, { definition: definition })
    errors = data.dig('metaobjectDefinitionCreate', 'userErrors') || []

    if errors.any?
      raise "Impossible de creer #{type}: #{errors.map { |error| error['message'] }.join(', ')}"
    end

    data.fetch('metaobjectDefinitionCreate').fetch('metaobjectDefinition')
  end

  def ensure_product_metafield_definition(key, metaobject_definition_id)
    definition = {
      name: "VD #{key.split('_').map(&:capitalize).join(' ')}",
      namespace: 'custom',
      key: key,
      description: "Reviews app definition for #{key}.",
      ownerType: 'PRODUCT',
      type: 'list.metaobject_reference',
      access: {
        admin: 'MERCHANT_READ_WRITE',
        storefront: 'PUBLIC_READ'
      },
      validations: [
        {
          name: 'metaobject_definition_id',
          value: metaobject_definition_id
        }
      ]
    }

    create_metafield_definition(definition)
  end

  def ensure_decimal_metafield_definition(key, name)
    definition = {
      name: name,
      namespace: 'custom',
      key: key,
      description: 'Reviews app aggregate.',
      ownerType: 'PRODUCT',
      type: 'number_decimal',
      access: {
        admin: 'MERCHANT_READ_WRITE',
        storefront: 'PUBLIC_READ'
      }
    }

    create_metafield_definition(definition)
  end

  def ensure_integer_metafield_definition(key, name)
    definition = {
      name: name,
      namespace: 'custom',
      key: key,
      description: 'Reviews app aggregate.',
      ownerType: 'PRODUCT',
      type: 'number_integer',
      access: {
        admin: 'MERCHANT_READ_WRITE',
        storefront: 'PUBLIC_READ'
      }
    }

    create_metafield_definition(definition)
  end

  def create_metafield_definition(definition)
    data = @client.graphql(METAFIELD_DEFINITION_CREATE_MUTATION, { definition: definition })
    errors = data.dig('metafieldDefinitionCreate', 'userErrors') || []
    return if errors.empty?

    messages = errors.map { |error| error['message'] }
    return if messages.any? { |message| message.include?('already exists') }

    raise "Impossible de creer #{definition[:namespace]}.#{definition[:key]}: #{messages.join(', ')}"
  rescue StandardError => error
    raise unless error.message.include?('already exists')
  end

  def review_definition_input
    {
      name: 'VD Review',
      type: 'vd_review',
      description: 'Review entries for the custom Vanille Desire reviews app.',
      displayNameKey: 'author',
      access: {
        admin: 'MERCHANT_READ_WRITE',
        storefront: 'PUBLIC_READ'
      },
      capabilities: {
        publishable: {
          enabled: true
        }
      },
      fieldDefinitions: [
        field('quote', 'Quote', 'multi_line_text_field', true),
        field('author', 'Author', 'single_line_text_field', true),
        field('rating', 'Rating', 'integer', true),
        field('review_date', 'Review date', 'date', false),
        field('context', 'Context', 'single_line_text_field', false),
        field('product', 'Product', 'product_reference', true),
        field('source', 'Source', 'single_line_text_field', false),
        field('verified', 'Verified', 'boolean', false),
        field('legacy_uuid', 'Legacy UUID', 'single_line_text_field', false),
        field('verification_method', 'Verification method', 'single_line_text_field', false),
        field('order_name', 'Order name', 'single_line_text_field', false),
        field('status', 'Status', 'single_line_text_field', false)
      ]
    }
  end

  def request_definition_input
    {
      name: 'VD Review Request',
      type: 'vd_review_request',
      description: 'Review request tokens and workflow objects for the custom reviews app.',
      displayNameKey: 'token',
      access: {
        admin: 'MERCHANT_READ_WRITE',
        storefront: 'NONE'
      },
      fieldDefinitions: [
        field('token', 'Token', 'single_line_text_field', true),
        field('product', 'Product', 'product_reference', true),
        field('order_name', 'Order name', 'single_line_text_field', false),
        field('customer_email', 'Customer email', 'single_line_text_field', false),
        field('state', 'State', 'single_line_text_field', true),
        field('channel', 'Channel', 'single_line_text_field', false),
        field('expires_at', 'Expires at', 'date_time', false)
      ]
    }
  end

  def qr_definition_input
    {
      name: 'VD Review QR',
      type: 'vd_review_qr',
      description: 'QR routing entries for the custom reviews app.',
      displayNameKey: 'label',
      access: {
        admin: 'MERCHANT_READ_WRITE',
        storefront: 'NONE'
      },
      fieldDefinitions: [
        field('product', 'Product', 'product_reference', true),
        field('landing_url', 'Landing URL', 'url', true),
        field('campaign', 'Campaign', 'single_line_text_field', false),
        field('label', 'Label', 'single_line_text_field', true)
      ]
    }
  end

  def field(key, name, type, required)
    {
      key: key,
      name: name,
      type: type,
      required: required
    }
  end
end

ReviewsMetaobjectsBootstrap.new.run
