require 'json'
require 'openssl'

class ActorRegistry
  ROLE_PERMISSIONS = {
    'admin' => %w[dashboard admin recipes:read recipes:write submissions:read publications:read audit:read recipes:approve recipes:reject recipes:archive recipes:export actors:read],
    'editor' => %w[dashboard admin recipes:read recipes:write submissions:read publications:read recipes:approve recipes:reject recipes:archive recipes:export],
    'partner' => %w[dashboard recipes:read recipes:submit]
  }.freeze

  def initialize(path, fallback_admin_token:)
    @path = path
    @fallback_admin_token = fallback_admin_token
  end

  def all
    load_registry.fetch('actors', [])
  end

  def find(id)
    all.find { |entry| entry['id'] == id }
  end

  def authenticate(token)
    actor = all.find do |entry|
      entry['active'] && token_match?(entry, token)
    end

    return actor if actor
    return fallback_admin_actor if secure_compare(@fallback_admin_token.to_s, token.to_s)

    nil
  end

  def allowed?(actor, permission)
    return false unless actor

    permissions_for(actor).include?(permission)
  end

  def permissions_for(actor)
    ROLE_PERMISSIONS.fetch(actor['role'].to_s, [])
  end

  def summary
    actors = all
    {
      total: actors.length,
      active: actors.count { |actor| actor['active'] },
      admins: actors.count { |actor| actor['role'] == 'admin' },
      editors: actors.count { |actor| actor['role'] == 'editor' },
      partners: actors.count { |actor| actor['role'] == 'partner' }
    }
  end

  private

  def load_registry
    JSON.parse(File.read(@path))
  end

  def fallback_admin_actor
    {
      'id' => 'legacy-admin-token',
      'name' => 'Legacy Admin',
      'email' => '',
      'role' => 'admin',
      'active' => true,
      'organization' => 'Vanille Desire'
    }
  end

  def token_match?(entry, token)
    return false if token.to_s.strip.empty?

    digest = entry['token_digest'].to_s
    if !digest.empty?
      return secure_compare(digest, digest_token(token))
    end

    secure_compare(entry['token'].to_s, token.to_s)
  end

  def digest_token(token)
    OpenSSL::Digest::SHA256.hexdigest(token.to_s)
  end

  def secure_compare(a, b)
    return false if a.empty? || b.empty? || a.bytesize != b.bytesize

    l = a.unpack "C#{a.bytesize}"
    res = 0
    b.each_byte { |byte| res |= byte ^ l.shift }
    res.zero?
  end
end
