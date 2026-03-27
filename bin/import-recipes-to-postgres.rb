#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'securerandom'
require_relative '../apps/recipes-service/lib/postgres_recipe_store'

root = File.expand_path('..', __dir__)
source_path = File.join(root, 'apps', 'recipes-service', 'data', 'recipes_store.json')
database_url = ENV.fetch('VD_RECIPES_DATABASE_URL')
schema_path = File.join(root, 'apps', 'recipes-service', 'schema.sql')

payload = JSON.parse(File.read(source_path))
store = PostgresRecipeStore.new(database_url: database_url, schema_path: schema_path)

payload.fetch('recipes', []).each do |recipe|
  copy = JSON.parse(JSON.generate(recipe))
  copy['id'] = store.send(:normalized_uuid, copy['id'])
  copy['revisions'] ||= []
  copy['moderation_notes'] ||= []
  store.send(:persist_recipe!, copy)
end

payload.fetch('audit_log', []).each do |entry|
  recipe_id = store.send(:safe_recipe_id, entry['slug'])
  store.send(:connection).exec_params(
    'insert into audit_log (id, actor_name, recipe_id, recipe_slug, event, payload, created_at) values ($1::uuid, $2, $3::uuid, $4, $5, $6::jsonb, $7::timestamptz) on conflict do nothing',
    [
      store.send(:normalized_uuid, entry['id']),
      entry['actor'],
      recipe_id,
      entry['slug'],
      entry['event'],
      JSON.generate(entry),
      entry['at'] || Time.now.utc.iso8601
    ]
  )
end

payload.fetch('publications', []).each do |entry|
  store.send(:connection).exec_params(
    'insert into publications (id, actor_name, published_count, output, created_at, payload) values ($1::uuid, $2, $3, $4, $5::timestamptz, $6::jsonb) on conflict do nothing',
    [
      store.send(:normalized_uuid, entry['id']),
      entry['actor'],
      entry['published_count'] || 0,
      entry['output'],
      entry['published_at'] || Time.now.utc.iso8601,
      JSON.generate(entry)
    ]
  )
end

puts "Imported #{payload.fetch('recipes', []).length} recipes into #{database_url}"
