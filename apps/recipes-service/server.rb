#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'webrick'
require 'English'
require_relative 'lib/recipe_store'

ROOT = File.expand_path(__dir__)
STORE = RecipeStore.new(File.join(ROOT, 'data', 'recipes_store.json'))
PORT = Integer(ENV.fetch('VD_RECIPES_PORT', '4567'))
ADMIN_TOKEN = ENV.fetch('VD_RECIPES_ADMIN_TOKEN', 'change-me')
EXPORT_SCRIPT = File.expand_path('../../bin/export-recipes-store.rb', __dir__)

def json_response(response, status, payload)
  response.status = status
  response['Content-Type'] = 'application/json'
  response.body = JSON.pretty_generate(payload)
end

def parse_body(request)
  return {} if request.body.to_s.strip.empty?

  JSON.parse(request.body)
rescue JSON::ParserError
  raise ArgumentError, 'invalid json body'
end

def admin_request?(request)
  request['X-VD-Admin-Token'] == ADMIN_TOKEN
end

def unauthorized!(response)
  json_response(response, 401, { error: 'unauthorized' })
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: '127.0.0.1',
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

server.mount_proc '/health' do |_request, response|
  json_response(response, 200, { ok: true, service: 'recipes-service' })
end

server.mount_proc '/recipes' do |request, response|
  case request.request_method
  when 'GET'
    status = request.query['status']
    recipes = status.to_s.empty? ? STORE.all : STORE.by_status(status)
    json_response(response, 200, { recipes: recipes })
  when 'POST'
    record = STORE.create_submission(parse_body(request))
    json_response(response, 201, record)
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

server.mount_proc '/submissions' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  json_response(response, 200, { submissions: STORE.by_status('pending') })
end

server.mount_proc '/exports/registry' do |request, response|
  if request.request_method != 'POST'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  output = `ruby #{EXPORT_SCRIPT} 2>&1`
  json_response(response, 200, { ok: $CHILD_STATUS.success?, output: output.strip })
end

server.mount_proc '/recipes/' do |request, response|
  slug = request.path.sub(%r{\A/recipes/}, '')

  if request.request_method == 'GET'
    recipe = STORE.find(slug)
    if recipe
      json_response(response, 200, recipe)
    else
      json_response(response, 404, { error: 'not_found' })
    end
    next
  end

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  reviewer = request['X-VD-Reviewer'] || 'unknown'

  if request.request_method == 'POST' && request.path.end_with?('/approve')
    target_slug = slug.sub(%r{/approve\z}, '')
    json_response(response, 200, STORE.approve(target_slug, reviewer))
  elsif request.request_method == 'POST' && request.path.end_with?('/reject')
    target_slug = slug.sub(%r{/reject\z}, '')
    json_response(response, 200, STORE.reject(target_slug, reviewer))
  elsif request.request_method == 'POST' && request.path.end_with?('/archive')
    target_slug = slug.sub(%r{/archive\z}, '')
    json_response(response, 200, STORE.archive(target_slug, reviewer))
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

server.start
