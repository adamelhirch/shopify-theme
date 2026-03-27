#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'fileutils'
require 'securerandom'
require_relative '../apps/recipes-service/lib/sql_recipe_store'

root = File.expand_path('..', __dir__)
source_path = File.join(root, 'apps', 'recipes-service', 'data', 'recipes_store.json')
target_path = ENV.fetch('VD_RECIPES_SQLITE_PATH', File.join(root, 'apps', 'recipes-service', 'data', 'recipes.sqlite3'))

payload = JSON.parse(File.read(source_path))
FileUtils.mkdir_p(File.dirname(target_path))
FileUtils.rm_f(target_path)

store = SqlRecipeStore.new(target_path)

payload.fetch('recipes', []).each do |recipe|
  copy = JSON.parse(JSON.generate(recipe))
  copy['id'] ||= SecureRandom.uuid
  copy['revisions'] ||= []
  copy['moderation_notes'] ||= []
  store.send(:persist_recipe!, copy)
end

payload.fetch('audit_log', []).each do |entry|
  store.send(:database).execute(
    'insert into audit_log (id, actor_name, recipe_slug, event, created_at, payload) values (?, ?, ?, ?, ?, ?)',
    entry['id'] || SecureRandom.uuid,
    entry['actor'],
    entry['slug'],
    entry['event'],
    entry['at'] || Time.now.utc.iso8601,
    JSON.generate(entry)
  )
end

payload.fetch('publications', []).each do |entry|
  store.send(:database).execute(
    'insert into publications (id, actor_name, published_count, output, created_at, payload) values (?, ?, ?, ?, ?, ?)',
    entry['id'] || SecureRandom.uuid,
    entry['actor'],
    entry['published_count'] || 0,
    entry['output'],
    entry['published_at'] || Time.now.utc.iso8601,
    JSON.generate(entry)
  )
end

puts "Imported #{payload.fetch('recipes', []).length} recipes into #{target_path}"
