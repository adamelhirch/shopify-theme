require 'cgi'
require 'openssl'

class ShopifyAppProxyAuth
  def self.build_from_env
    new(shared_secret: ENV['VD_RECIPES_SHOPIFY_API_SECRET'] || ENV['SHOPIFY_API_SECRET'] || '')
  end

  def initialize(shared_secret:)
    @shared_secret = shared_secret.to_s.strip
  end

  def configured?
    !@shared_secret.empty?
  end

  def configuration_errors
    return [] if configured?

    ['VD_RECIPES_SHOPIFY_API_SECRET ou SHOPIFY_API_SECRET manquant']
  end

  def valid_request?(query_hash)
    return false unless configured?

    params = stringify_params(query_hash)
    signature = params.delete('signature').to_s
    return false if signature.empty?

    secure_compare(signature, sign_params(params))
  end

  private

  def stringify_params(query_hash)
    query_hash.each_with_object({}) do |(key, value), memo|
      memo[key.to_s] =
        if value.is_a?(Array)
          value.map(&:to_s)
        else
          value.to_s
        end
    end
  end

  def sign_params(params)
    sorted = params.sort_by { |key, _value| key }
    payload = sorted.map do |key, value|
      if value.is_a?(Array)
        value.sort.map { |entry| "#{key}=#{CGI.unescape(entry.to_s)}" }.join
      else
        "#{key}=#{CGI.unescape(value.to_s)}"
      end
    end.join

    OpenSSL::HMAC.hexdigest('sha256', @shared_secret, payload)
  end

  def secure_compare(a, b)
    return false if a.to_s.empty? || b.to_s.empty? || a.bytesize != b.bytesize

    left = a.unpack("C#{a.bytesize}")
    result = 0
    b.each_byte { |byte| result |= byte ^ left.shift }
    result.zero?
  end
end
