#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'socket'
require 'stringio'
require 'uri'

require_relative 'lib/reviews_store'

class ReviewsApiApp
  def initialize(store:)
    @store = store
  end

  def call(method:, path:, query:, body:)
    case method
    when 'OPTIONS'
      respond(204, {})
    when 'GET'
      handle_get(path, query)
    when 'POST'
      handle_post(path, parse_json(body))
    else
      respond(405, { error: 'Method not allowed' })
    end
  rescue KeyError => error
    respond(422, { error: "Missing field: #{error.message}" })
  rescue StandardError => error
    log_error(error)
    respond(500, { error: error.message })
  end

  private

  def handle_get(path, query)
    case path
    when '/healthz'
      respond(200, { ok: true })
    when '/api/dashboard'
      respond(200, @store.dashboard)
    when '/api/reviews'
      respond(200, { reviews: @store.list_reviews(status: query['status']) })
    when '/api/requests'
      respond(200, { requests: @store.list_requests(state: query['state']), summary: @store.dashboard[:requests] })
    when '/api/products'
      respond(200, { products: @store.products })
    when '/api/widgets'
      respond(200, { widgets: @store.widgets })
    when '/api/settings'
      respond(200, { settings: @store.settings })
    else
      respond(404, { error: 'Not found' })
    end
  end

  def handle_post(path, payload)
    case path
    when '/apps/vd-reviews/submit'
      review = @store.submit_review(payload)
      respond(201, { ok: true, review: review })
    when '/apps/vd-reviews/moderate'
      review = @store.moderate_review(payload.fetch('review_id'), payload.fetch('status'))
      respond(200, { ok: true, review: review })
    when '/apps/vd-reviews/respond'
      review = @store.respond_to_review(payload.fetch('review_id'), payload.fetch('reply'))
      respond(200, { ok: true, review: review })
    when '/api/requests'
      request_entry = @store.create_review_request(payload)
      respond(201, { ok: true, review_request: request_entry })
    when '/api/settings'
      settings = @store.update_settings(payload)
      respond(200, { ok: true, settings: settings })
    else
      respond(404, { error: 'Not found' })
    end
  end

  def parse_json(body)
    return {} if body.to_s.strip.empty?

    JSON.parse(body)
  rescue JSON::ParserError
    {}
  end

  def respond(status, payload)
    [status, JSON.generate(payload)]
  end

  def log_error(error)
    $stdout.puts "[vd-reviews] #{error.class}: #{error.message}"
    Array(error.backtrace).each { |line| $stdout.puts "  #{line}" }
    $stdout.flush
  end
end

class ReviewsHttpServer
  STATUS_TEXT = {
    200 => 'OK',
    201 => 'Created',
    204 => 'No Content',
    404 => 'Not Found',
    405 => 'Method Not Allowed',
    422 => 'Unprocessable Entity',
    500 => 'Internal Server Error'
  }.freeze

  def initialize(bind_address:, port:, app:)
    @bind_address = bind_address
    @port = port
    @app = app
    @server = TCPServer.new(@bind_address, @port)
  end

  def start
    loop do
      client = @server.accept
      handle_client(client)
    rescue Interrupt
      break
    rescue StandardError => error
      log_error(error)
    end
  ensure
    @server.close if @server && !@server.closed?
  end

  private

  def handle_client(client)
    request_line = client.gets("\n")
    return client.close unless request_line

    method, target, = request_line.strip.split(' ', 3)
    headers = read_headers(client)
    body = read_body(client, headers['content-length'])

    uri = URI.parse(target)
    query = URI.decode_www_form(String(uri.query)).to_h
    status, payload = @app.call(method: method, path: uri.path, query: query, body: body)

    write_response(client, status, payload)
  rescue URI::InvalidURIError => error
    log_error(error)
    write_response(client, 422, JSON.generate(error: 'Invalid request URI'))
  rescue StandardError => error
    log_error(error)
    write_response(client, 500, JSON.generate(error: error.message))
  ensure
    client.close unless client.closed?
  end

  def read_headers(client)
    headers = {}

    while (line = client.gets("\n"))
      line = line.strip
      break if line.empty?

      key, value = line.split(':', 2)
      next unless key && value

      headers[key.downcase] = value.strip
    end

    headers
  end

  def read_body(client, length_header)
    length = length_header.to_i
    return '' if length <= 0

    client.read(length).to_s
  end

  def write_response(client, status, payload)
    body = status == 204 ? '' : payload.to_s
    client.write("HTTP/1.1 #{status} #{STATUS_TEXT.fetch(status, 'OK')}\r\n")
    client.write("Content-Type: application/json; charset=utf-8\r\n")
    client.write("Access-Control-Allow-Origin: *\r\n")
    client.write("Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n")
    client.write("Access-Control-Allow-Headers: Content-Type\r\n")
    client.write("Content-Length: #{body.bytesize}\r\n")
    client.write("Connection: close\r\n")
    client.write("\r\n")
    client.write(body)
  end

  def log_error(error)
    $stdout.puts "[vd-reviews] #{error.class}: #{error.message}"
    Array(error.backtrace).each { |line| $stdout.puts "  #{line}" }
    $stdout.flush
  end
end

$stdout.sync = true

port = ENV.fetch('VD_REVIEWS_PORT', '4567').to_i
bind_address = ENV.fetch('VD_REVIEWS_BIND', '127.0.0.1')
store = ReviewsStore.new
app = ReviewsApiApp.new(store: store)

trap('INT') { exit }

puts "VD Reviews service listening on http://#{bind_address}:#{port}"
ReviewsHttpServer.new(bind_address: bind_address, port: port, app: app).start
