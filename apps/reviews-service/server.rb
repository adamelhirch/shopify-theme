#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'webrick'

require_relative 'lib/reviews_store'

class ReviewsApiServlet < WEBrick::HTTPServlet::AbstractServlet
  def initialize(server, store:)
    super(server)
    @store = store
  end

  def do_OPTIONS(request, response)
    write_json(response, 204, {})
  end

  def do_GET(request, response)
    case request.path
    when '/healthz'
      write_json(response, 200, { ok: true })
    when '/api/dashboard'
      write_json(response, 200, @store.dashboard)
    when '/api/reviews'
      write_json(response, 200, { reviews: @store.list_reviews(status: request.query['status']) })
    when '/api/requests'
      write_json(response, 200, { requests: @store.list_requests(state: request.query['state']), summary: @store.dashboard[:requests] })
    when '/api/products'
      write_json(response, 200, { products: @store.products })
    when '/api/widgets'
      write_json(response, 200, { widgets: @store.widgets })
    when '/api/settings'
      write_json(response, 200, { settings: @store.settings })
    else
      write_json(response, 404, { error: 'Not found' })
    end
  end

  def do_POST(request, response)
    payload = parse_json(request.body)

    case request.path
    when '/apps/vd-reviews/submit'
      review = @store.submit_review(payload)
      write_json(response, 201, { ok: true, review: review })
    when '/apps/vd-reviews/moderate'
      review = @store.moderate_review(payload.fetch('review_id'), payload.fetch('status'))
      write_json(response, 200, { ok: true, review: review })
    when '/apps/vd-reviews/respond'
      review = @store.respond_to_review(payload.fetch('review_id'), payload.fetch('reply'))
      write_json(response, 200, { ok: true, review: review })
    when '/api/requests'
      request_entry = @store.create_review_request(payload)
      write_json(response, 201, { ok: true, review_request: request_entry })
    when '/api/settings'
      settings = @store.update_settings(payload)
      write_json(response, 200, { ok: true, settings: settings })
    else
      write_json(response, 404, { error: 'Not found' })
    end
  rescue KeyError => error
    write_json(response, 422, { error: "Missing field: #{error.message}" })
  rescue StandardError => error
    write_json(response, 500, { error: error.message })
  end

  private

  def parse_json(body)
    return {} if body.to_s.strip.empty?

    JSON.parse(body)
  rescue JSON::ParserError
    {}
  end

  def write_json(response, status, payload)
    response.status = status
    response['Content-Type'] = 'application/json; charset=utf-8'
    response['Access-Control-Allow-Origin'] = '*'
    response['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    response['Access-Control-Allow-Headers'] = 'Content-Type'
    response.body = JSON.generate(payload)
  end
end

port = ENV.fetch('VD_REVIEWS_PORT', '4567').to_i
store = ReviewsStore.new

server = WEBrick::HTTPServer.new(
  BindAddress: '127.0.0.1',
  Port: port,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::WARN)
)

server.mount('/', ReviewsApiServlet, store: store)
trap('INT') { server.shutdown }

puts "VD Reviews service listening on http://127.0.0.1:#{port}"
server.start
