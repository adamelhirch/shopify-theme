#!/usr/bin/env ruby
# frozen_string_literal: true

service_path = File.expand_path('../apps/reviews-service/server.rb', __dir__)
exec('ruby', service_path)
