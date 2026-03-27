#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'webrick'
require_relative 'lib/recipe_store'

ROOT = File.expand_path(__dir__)
STORE = RecipeStore.new(File.join(ROOT, 'data', 'recipes_store.json'))
PORT = Integer(ENV.fetch('VD_RECIPES_PORT', '4567'))
ADMIN_TOKEN = ENV.fetch('VD_RECIPES_ADMIN_TOKEN', 'change-me')

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
    json_response(response, 200, { recipes: STORE.all })
  when 'POST'
    record = STORE.create_submission(parse_body(request))
    json_response(response, 201, record)
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
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

  token = request['X-VD-Admin-Token']
  unless token == ADMIN_TOKEN
    json_response(response, 401, { error: 'unauthorized' })
    next
  end

  reviewer = request['X-VD-Reviewer'] || 'unknown'

  if request.request_method == 'POST' && request.path.end_with?('/approve')
    target_slug = slug.sub(%r{/approve\z}, '')
    json_response(response, 200, STORE.approve(target_slug, reviewer))
  elsif request.request_method == 'POST' && request.path.end_with?('/reject')
    target_slug = slug.sub(%r{/reject\z}, '')
    json_response(response, 200, STORE.reject(target_slug, reviewer))
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

server.start
