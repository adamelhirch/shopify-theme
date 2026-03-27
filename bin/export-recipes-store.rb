#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'time'
require_relative '../apps/recipes-service/lib/store_factory'

root = File.expand_path('..', __dir__)
output_path = File.join(root, 'assets', 'vd-recipes-registry.json')
store = StoreFactory.build(root: File.join(root, 'apps', 'recipes-service'))
recipes = store.published.map do |recipe|
  recipe.reject do |key, _value|
    %w[revisions moderation_notes validated_by validated_at created_at updated_at].include?(key)
  end
end

public_payload = {
  generated_at: Time.now.utc.iso8601,
  recipes: recipes
}

File.write(output_path, JSON.pretty_generate(public_payload) + "\n")
puts "Exported #{recipes.length} recipes to #{output_path}"
