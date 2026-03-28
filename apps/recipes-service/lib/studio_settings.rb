require 'json'

class StudioSettings
  DEFAULTS = {
    'shopify' => {
      'store_domain' => '4bru0c-p4.myshopify.com',
      'api_version' => '2025-10',
      'preview_theme_prefix' => 'QA Shared v',
      'preview_exclude_names' => ['QA Shared v1'],
      'preview_role_allowlist' => %w[unpublished development],
      'sync_args' => ['--nodelete']
    },
    'modules' => {
      'recipes' => {
        'title' => 'Recettes',
        'summary' => 'Creation, import, moderation, publication Shopify et export vers le registre public.',
        'status' => 'active',
        'enabled' => true,
        'local_path' => '/admin/login'
      },
      'wiki' => {
        'title' => 'Wiki',
        'summary' => 'Base preparee pour accueillir un vrai poste editorial, recherche, workflow et publication.',
        'status' => 'planned',
        'enabled' => true,
        'local_path' => nil
      },
      'pages' => {
        'title' => 'Pages',
        'summary' => 'Module prevu pour les pages editoriales, landing pages et experiences hors simple preview.',
        'status' => 'planned',
        'enabled' => true,
        'local_path' => nil
      }
    }
  }.freeze

  attr_reader :path

  def initialize(path)
    @path = path
  end

  def data
    @data ||= deep_merge(deep_clone(DEFAULTS), load_file)
  end

  def shopify
    data.fetch('shopify', {})
  end

  def modules
    data.fetch('modules', {})
  end

  def module_list
    modules.map do |key, entry|
      {
        'key' => key,
        'title' => entry['title'],
        'summary' => entry['summary'],
        'status' => entry['status'],
        'enabled' => !!entry['enabled'],
        'local_path' => entry['local_path']
      }
    end
  end

  private

  def load_file
    return {} unless File.exist?(path)

    JSON.parse(File.read(path))
  rescue JSON::ParserError
    {}
  end

  def deep_clone(value)
    JSON.parse(JSON.generate(value))
  end

  def deep_merge(base, overlay)
    return base unless overlay.is_a?(Hash)

    overlay.each do |key, value|
      if base[key].is_a?(Hash) && value.is_a?(Hash)
        base[key] = deep_merge(base[key], value)
      else
        base[key] = value
      end
    end
    base
  end
end
