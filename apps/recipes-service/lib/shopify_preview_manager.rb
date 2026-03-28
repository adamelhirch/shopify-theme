require 'json'
require 'net/http'
require 'open3'
require 'time'
require 'uri'

class ShopifyPreviewManager
  DEFAULT_API_VERSION = '2025-10'.freeze

  def self.build_from_env(settings:)
    shopify_settings = settings.shopify
    new(
      settings_path: settings.path,
      shop_domain: ENV['VD_RECIPES_SHOPIFY_STORE'] || ENV['SHOPIFY_STORE'] || shopify_settings['store_domain'],
      access_token: ENV['VD_RECIPES_SHOPIFY_ADMIN_TOKEN'] || ENV['SHOPIFY_ADMIN_ACCESS_TOKEN'] || '',
      api_version: ENV['VD_RECIPES_SHOPIFY_API_VERSION'] || ENV['SHOPIFY_API_VERSION'] || shopify_settings['api_version'] || DEFAULT_API_VERSION,
      preview_theme_prefix: ENV['VD_RECIPES_PREVIEW_THEME_PREFIX'] || shopify_settings['preview_theme_prefix'],
      preview_exclude_names: csv_or_array(ENV['VD_RECIPES_PREVIEW_EXCLUDE'], shopify_settings['preview_exclude_names']),
      preview_role_allowlist: csv_or_array(ENV['VD_RECIPES_PREVIEW_ROLES'], shopify_settings['preview_role_allowlist']),
      sync_args: csv_or_array(ENV['VD_RECIPES_PREVIEW_SYNC_ARGS'], shopify_settings['sync_args'])
    )
  end

  def self.csv_or_array(raw, fallback)
    return fallback if raw.to_s.strip.empty?

    raw.split(',').map(&:strip).reject(&:empty?)
  end

  attr_reader :shop_domain, :api_version, :preview_theme_prefix, :preview_exclude_names, :preview_role_allowlist, :settings_path

  def initialize(settings_path:, shop_domain:, access_token:, api_version:, preview_theme_prefix:, preview_exclude_names:, preview_role_allowlist:, sync_args:)
    @settings_path = settings_path
    @shop_domain = shop_domain.to_s.strip
    @access_token = access_token.to_s.strip
    @api_version = api_version.to_s.strip.empty? ? DEFAULT_API_VERSION : api_version.to_s.strip
    @preview_theme_prefix = preview_theme_prefix.to_s.strip
    @preview_exclude_names = Array(preview_exclude_names).map(&:to_s).map(&:strip).reject(&:empty?)
    @preview_role_allowlist = Array(preview_role_allowlist).map(&:to_s).map(&:strip).reject(&:empty?)
    @sync_args = Array(sync_args).map(&:to_s).map(&:strip).reject(&:empty?)
  end

  def configuration_errors
    errors = []
    errors << 'store Shopify manquant' if shop_domain.empty?
    errors
  end

  def configured?
    configuration_errors.empty?
  end

  def cli_available?
    output, status = Open3.capture2e('shopify', 'version')
    status.success? && !output.to_s.strip.empty?
  rescue StandardError
    false
  end

  def preview_target
    return failed_target(configuration_errors.join(', ')) unless configured?

    themes = fetch_themes
    return failed_target('aucun theme Shopify detecte') if themes.empty?

    candidates = themes.select do |theme|
      name = theme['name'].to_s
      next false if name.empty?
      next false if preview_theme_prefix.empty?
      next false unless name.start_with?(preview_theme_prefix)
      next false if preview_exclude_names.include?(name)
      next false if preview_role_allowlist.any? && !preview_role_allowlist.include?(theme['role'].to_s)

      true
    end

    return failed_target("aucune preview ne correspond au prefixe #{preview_theme_prefix}") if candidates.empty?

    selected = candidates.max_by do |theme|
      [version_vector(theme['name']), role_weight(theme['role']), timestamp(theme['updated_at']), theme['id'].to_i]
    end

    {
      ok: true,
      resolution_strategy: 'latest_version_by_prefix',
      source: selected['source'] || 'shopify-cli',
      id: selected['id'].to_i,
      name: selected['name'],
      role: selected['role'],
      version: extract_version(selected['name']),
      updated_at: selected['updated_at'],
      preview_url: "https://#{shop_domain}?preview_theme_id=#{selected['id']}",
      editor_url: "https://#{shop_domain}/admin/themes/#{selected['id']}/editor",
      store_domain: shop_domain
    }
  rescue StandardError => e
    failed_target(e.message)
  end

  def metadata
    {
      configured: configured?,
      cli_available: cli_available?,
      store_domain: shop_domain,
      api_version: api_version,
      preview_theme_prefix: preview_theme_prefix,
      preview_exclude_names: preview_exclude_names,
      preview_role_allowlist: preview_role_allowlist,
      settings_path: settings_path,
      preview_target: preview_target
    }
  end

  def sync_latest_preview(repo_root:, extra_args: [])
    target = preview_target
    return target.merge(ok: false) unless target[:ok]

    args = sync_arguments(extra_args)
    command = ['shopify', 'theme', 'push', '--store', shop_domain, '--theme', target[:id].to_s, *args]
    output, status = Open3.capture2e(*command, chdir: repo_root)

    {
      ok: status.success?,
      command: command.join(' '),
      output: output.strip,
      target: target
    }
  rescue StandardError => e
    {
      ok: false,
      error: e.message,
      target: target
    }
  end

  private

  def sync_arguments(extra_args)
    args = @sync_args.dup
    args << '--nodelete' unless args.include?('--nodelete')
    args.concat(Array(extra_args).map(&:to_s).reject(&:empty?))
    args
  end

  def fetch_themes
    cli_themes = fetch_themes_via_cli
    return cli_themes unless cli_themes.empty?
    return [] if @access_token.empty?

    fetch_themes_via_api
  end

  def fetch_themes_via_cli
    return [] unless cli_available?

    output, status = Open3.capture2e('shopify', 'theme', 'list', '--store', shop_domain, '--json')
    raise "shopify theme list a echoue: #{output}" unless status.success?

    payload = JSON.parse(output)
    Array(payload).map do |entry|
      {
        'id' => entry['id'],
        'name' => entry['name'],
        'role' => entry['role'],
        'updated_at' => nil,
        'source' => 'shopify-cli'
      }
    end
  rescue JSON::ParserError
    []
  end

  def fetch_themes_via_api
    uri = URI("https://#{shop_domain}/admin/api/#{api_version}/themes.json?fields=id,name,role,updated_at")
    request = Net::HTTP::Get.new(uri)
    request['Content-Type'] = 'application/json'
    request['X-Shopify-Access-Token'] = @access_token

    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true) do |http|
      http.request(request)
    end

    raise "Shopify API error HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    payload = JSON.parse(response.body)
    Array(payload['themes']).map do |entry|
      entry.merge('source' => 'shopify-admin-api')
    end
  end

  def failed_target(error)
    {
      ok: false,
      error: error,
      resolution_strategy: 'latest_version_by_prefix',
      store_domain: shop_domain
    }
  end

  def role_weight(role)
    case role.to_s
    when 'development' then 2
    when 'unpublished' then 1
    else 0
    end
  end

  def timestamp(value)
    Time.parse(value.to_s).to_i
  rescue StandardError
    0
  end

  def extract_version(name)
    suffix = name.to_s.sub(/\A#{Regexp.escape(preview_theme_prefix)}/, '')
    suffix[/\d+(?:\.\d+)*/].to_s
  end

  def version_vector(name)
    version = extract_version(name)
    vector = version.split('.').map { |segment| segment.to_i }
    vector.empty? ? [0] : vector
  end
end
