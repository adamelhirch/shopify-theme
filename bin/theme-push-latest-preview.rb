#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require_relative '../apps/recipes-service/lib/studio_settings'
require_relative '../apps/recipes-service/lib/shopify_preview_manager'

repo_root = File.expand_path('..', __dir__)
settings = StudioSettings.new(File.join(repo_root, 'apps', 'recipes-service', 'data', 'studio_settings.json'))
manager = ShopifyPreviewManager.build_from_env(settings: settings)

result = manager.sync_latest_preview(repo_root: repo_root, extra_args: ARGV)
puts JSON.pretty_generate(result)
exit(result[:ok] ? 0 : 1)
