#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'time'

ROOT = File.expand_path('..', __dir__)
STORE_PATH = File.join(ROOT, 'apps', 'recipes-service', 'data', 'recipes_store.json')
OUTPUT_PATH = File.join(ROOT, 'docs', 'recipes-rollout-checklist.md')

def sentence(value)
  text = value.to_s.strip
  return '' if text.empty?
  text.end_with?('.', '!', '?') ? text : "#{text}."
end

def generic_hero(recipe)
  category = recipe['category'].to_s.downcase
  title = recipe['title'].to_s

  if category.include?('sale')
    "Plan final du plat #{title.downcase}, dressé simplement, avec une lecture claire du volume, de la matière et de la finition."
  elsif title.downcase.include?('cake') || title.downcase.include?('bread')
    "Plan trois-quarts de #{title.downcase}, tranché proprement, avec une part ouverte pour montrer la mie."
  else
    "Plan final de #{title.downcase}, servi proprement, avec une lecture immédiate de la texture et de la finition."
  end
end

def generic_gallery(recipe)
  title = recipe['title'].to_s
  [
    {
      'shot' => "Plan large de #{title.downcase} au service.",
      'caption' => 'Vue d’ensemble du service.',
      'alt' => "#{title} prêt à être servi."
    },
    {
      'shot' => "Gros plan sur la texture de #{title.downcase}.",
      'caption' => 'Texture et finition.',
      'alt' => "Texture de #{title.downcase}."
    },
    {
      'shot' => "Finition ou détail de service autour de #{title.downcase}.",
      'caption' => 'Dernier geste avant dégustation.',
      'alt' => "Finition de #{title.downcase}."
    }
  ]
end

def generic_steps(recipe)
  Array(recipe['steps']).each_with_index.map do |step, index|
    {
      'index' => index + 1,
      'shot' => sentence(step['title']).sub(/\A./, &:upcase),
      'caption' => sentence(step['highlight'].to_s.empty? ? step['title'] : step['highlight']),
      'alt' => "Étape #{index + 1} de #{recipe['title']}."
    }
  end
end

def media_plan(recipe)
  plan = recipe['media_plan'].is_a?(Hash) ? recipe['media_plan'] : {}
  {
    'hero' => plan['hero'].is_a?(Hash) ? plan['hero'] : { 'shot' => generic_hero(recipe), 'why' => 'Donner immédiatement envie d’ouvrir la fiche et de cuisiner.', 'caption' => recipe.dig('hero', 'ambient_label').to_s },
    'gallery' => Array(plan['gallery']).empty? ? generic_gallery(recipe) : Array(plan['gallery']),
    'steps' => Array(plan['steps']).empty? ? generic_steps(recipe) : Array(plan['steps'])
  }
end

store = JSON.parse(File.read(STORE_PATH))
recipes = Array(store['recipes']).select { |recipe| recipe['status'] == 'approved' }

missing_pages = recipes.select { |recipe| recipe['page_url'].to_s.strip.empty? }

markdown = []
markdown << "# Recipes Rollout Checklist"
markdown << ""
markdown << "_Generated at #{Time.now.utc.iso8601}_"
markdown << ""
markdown << "## Page Status"
markdown << ""
markdown << "| Recipe | Slug | Public URL | Status | Action |"
markdown << "|---|---|---|---|---|"

recipes.each do |recipe|
  page_url = recipe['page_url'].to_s.strip
  action = page_url.empty? ? "Create Shopify page with handle `#{recipe['slug']}`" : 'Already routed'
  markdown << "| #{recipe['title']} | `#{recipe['slug']}` | #{page_url.empty? ? 'Pending' : page_url} | #{recipe['status']} | #{action} |"
end

markdown << ""
markdown << "## Missing Dedicated Pages"
markdown << ""
missing_pages.each do |recipe|
  markdown << "- `#{recipe['slug']}`: create a Shopify page with handle `#{recipe['slug']}`"
end

markdown << ""
markdown << "## Media Checklist By Recipe"
markdown << ""

recipes.each do |recipe|
  plan = media_plan(recipe)
  markdown << "### #{recipe['title']}"
  markdown << ""
  markdown << "- Slug: `#{recipe['slug']}`"
  markdown << "- Current page: #{recipe['page_url'].to_s.strip.empty? ? 'Pending dedicated page' : recipe['page_url']}"
  markdown << "- Hero: #{sentence(plan.dig('hero', 'shot'))}"
  markdown << "- Why: #{sentence(plan.dig('hero', 'why'))}"
  markdown << "- Hero caption suggestion: #{sentence(plan.dig('hero', 'caption'))}" unless plan.dig('hero', 'caption').to_s.strip.empty?
  markdown << "- Gallery:"
  Array(plan['gallery']).each_with_index do |entry, index|
    markdown << "  - #{index + 1}. #{sentence(entry['shot'])}"
  end
  markdown << "- Step media:"
  Array(plan['steps']).each do |entry|
    markdown << "  - Étape #{entry['index']}: #{sentence(entry['shot'])}"
  end
  markdown << ""
end

File.write(OUTPUT_PATH, markdown.join("\n"))
puts "Wrote #{OUTPUT_PATH}"
