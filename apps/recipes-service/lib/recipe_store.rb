require 'json'
require 'securerandom'
require 'time'

class RecipeStore
  attr_reader :path

  ALLOWED_STATUSES = %w[pending approved rejected archived draft].freeze
  ALLOWED_ACCESS = %w[free member].freeze

  def initialize(path)
    @path = path
  end

  def all(filters = {})
    recipes = load_store.fetch('recipes', [])

    if filters[:status]
      recipes = recipes.select { |recipe| recipe['status'] == filters[:status] }
    end

    if filters[:access]
      recipes = recipes.select { |recipe| recipe['access'] == filters[:access] }
    end

    if filters[:submitted_by_type]
      recipes = recipes.select do |recipe|
        recipe.dig('submitted_by', 'type') == filters[:submitted_by_type]
      end
    end

    if filters[:query]
      needle = normalized(filters[:query])
      recipes = recipes.select do |recipe|
        searchable_blob(recipe).include?(needle)
      end
    end

    recipes.sort_by do |recipe|
      recipe['updated_at'] || recipe['validated_at'] || recipe['submitted_at'] || ''
    end.reverse
  end

  def published
    all(status: 'approved')
  end

  def by_status(status)
    all(status: status)
  end

  def pending_submissions
    all(status: 'pending')
  end

  def find(slug)
    load_store.fetch('recipes', []).find { |recipe| recipe['slug'] == slug }
  end

  def revision_history(slug)
    recipe = find(slug)
    raise KeyError, 'recipe not found' unless recipe

    recipe.fetch('revisions', []).reverse
  end

  def publication_history(limit = 25)
    load_store.fetch('publications', []).last(limit).reverse
  end

  def audit_log(limit = 50)
    load_store.fetch('audit_log', []).last(limit).reverse
  end

  def dashboard_summary
    recipes = load_store.fetch('recipes', [])

    {
      total: recipes.length,
      approved: recipes.count { |recipe| recipe['status'] == 'approved' },
      pending: recipes.count { |recipe| recipe['status'] == 'pending' },
      rejected: recipes.count { |recipe| recipe['status'] == 'rejected' },
      archived: recipes.count { |recipe| recipe['status'] == 'archived' },
      member: recipes.count { |recipe| recipe['access'] == 'member' },
      free: recipes.count { |recipe| recipe['access'] == 'free' },
      last_publication: load_store.fetch('publications', []).last
    }
  end

  def create_submission(payload, actor: nil)
    store = load_store
    recipes = store.fetch('recipes', [])
    slug = payload.fetch('slug')

    raise ArgumentError, 'slug already exists' if recipes.any? { |recipe| recipe['slug'] == slug }

    now = now_iso
    record = normalize_recipe_payload(payload).merge(
      'status' => 'pending',
      'submitted_at' => now,
      'created_at' => now,
      'updated_at' => now,
      'validated_at' => nil,
      'validated_by' => nil,
      'moderation_notes' => [],
      'revisions' => []
    )

    append_revision!(record, actor: actor || record.dig('submitted_by', 'name') || 'submission', event: 'created')
    recipes << record
    append_audit!(store, 'submission_created', slug: slug, actor: actor || record.dig('submitted_by', 'name'))
    save_store(store)
    record
  end

  def create_recipe(payload, actor:)
    store = load_store
    recipes = store.fetch('recipes', [])
    slug = payload.fetch('slug')

    raise ArgumentError, 'slug already exists' if recipes.any? { |recipe| recipe['slug'] == slug }

    now = now_iso
    record = normalize_recipe_payload(payload).merge(
      'status' => payload['status'] || 'draft',
      'submitted_at' => now,
      'created_at' => now,
      'updated_at' => now,
      'validated_at' => nil,
      'validated_by' => nil,
      'moderation_notes' => [],
      'revisions' => []
    )

    append_revision!(record, actor: actor, event: 'created')
    recipes << record
    append_audit!(store, 'recipe_created', slug: slug, actor: actor)
    save_store(store)
    record
  end

  def update_recipe(slug, payload, actor:)
    store = load_store
    recipe = recipe_from_store!(store, slug)
    update_fields!(recipe, payload, actor: actor, event: 'updated')
    append_audit!(store, 'recipe_updated', slug: slug, actor: actor)
    save_store(store)
    recipe
  end

  def approve(slug, reviewer, note: nil)
    update_status(slug, 'approved', reviewer, note: note)
  end

  def reject(slug, reviewer, note: nil)
    update_status(slug, 'rejected', reviewer, note: note)
  end

  def archive(slug, reviewer, note: nil)
    update_status(slug, 'archived', reviewer, note: note)
  end

  def record_publication(actor:, output:, published_count:)
    store = load_store
    store['publications'] << {
      'id' => SecureRandom.hex(8),
      'published_at' => now_iso,
      'actor' => actor,
      'published_count' => published_count,
      'output' => output
    }
    append_audit!(store, 'registry_exported', actor: actor, published_count: published_count)
    save_store(store)
    store['publications'].last
  end

  private

  def update_status(slug, status, reviewer, note: nil)
    store = load_store
    recipe = recipe_from_store!(store, slug)
    raise ArgumentError, 'invalid status' unless ALLOWED_STATUSES.include?(status)

    recipe['status'] = status
    recipe['validated_at'] = now_iso
    recipe['validated_by'] = reviewer
    recipe['updated_at'] = now_iso
    recipe['moderation_notes'] << {
      'at' => now_iso,
      'actor' => reviewer,
      'status' => status,
      'note' => note.to_s.strip
    }
    append_revision!(recipe, actor: reviewer, event: "status_#{status}")
    append_audit!(store, 'recipe_status_changed', slug: slug, actor: reviewer, status: status)
    save_store(store)
    recipe
  end

  def recipe_from_store!(store, slug)
    recipe = store.fetch('recipes', []).find { |entry| entry['slug'] == slug }
    raise KeyError, 'recipe not found' unless recipe

    recipe
  end

  def update_fields!(recipe, payload, actor:, event:)
    clean_payload = normalize_recipe_payload(payload, require_slug: false)
    protected_fields = %w[slug created_at revisions moderation_notes submitted_at]
    clean_payload.each do |key, value|
      next if protected_fields.include?(key)

      recipe[key] = value
    end
    recipe['updated_at'] = now_iso
    append_revision!(recipe, actor: actor, event: event)
  end

  def normalize_recipe_payload(payload, require_slug: true)
    slug = payload['slug'] || payload[:slug]
    raise KeyError, 'slug is required' if require_slug && blank?(slug)
    raise KeyError, 'title is required' if blank?(payload['title'] || payload[:title])

    access = (payload['access'] || payload[:access] || 'free').to_s
    raise ArgumentError, 'invalid access' unless ALLOWED_ACCESS.include?(access)

    status = (payload['status'] || payload[:status] || 'pending').to_s
    raise ArgumentError, 'invalid status' unless ALLOWED_STATUSES.include?(status)

    result = deep_stringify_keys(payload)
    result['slug'] = slug if slug
    result['access'] = access
    result['status'] = status
    result['submitted_by'] ||= { 'name' => 'Unknown', 'type' => 'partner' }
    result['ingredient_groups'] ||= []
    result['steps'] ||= []
    result['tips'] ||= []
    result['search_terms'] ||= []
    result['product'] ||= {}
    result['difficulty'] ||= { 'value' => 'facile', 'label' => 'Facile' }
    result['timing'] ||= {}
    result['hero'] ||= {}
    result
  end

  def deep_stringify_keys(value)
    case value
    when Hash
      value.each_with_object({}) do |(key, nested), result|
        result[key.to_s] = deep_stringify_keys(nested)
      end
    when Array
      value.map { |nested| deep_stringify_keys(nested) }
    else
      value
    end
  end

  def load_store
    raw = JSON.parse(File.read(path))
    raw['meta'] ||= { 'schema_version' => 2 }
    raw['recipes'] ||= []
    raw['audit_log'] ||= []
    raw['publications'] ||= []

    raw['recipes'].each do |recipe|
      recipe['revisions'] ||= []
      recipe['moderation_notes'] ||= []
      recipe['created_at'] ||= recipe['submitted_at']
      recipe['updated_at'] ||= recipe['validated_at'] || recipe['submitted_at']
    end

    raw
  end

  def save_store(store)
    File.write(path, JSON.pretty_generate(store) + "\n")
  end

  def append_revision!(recipe, actor:, event:)
    recipe['revisions'] ||= []
    recipe['revisions'] << {
      'id' => SecureRandom.hex(6),
      'at' => now_iso,
      'actor' => actor,
      'event' => event,
      'snapshot' => snapshot_for_revision(recipe)
    }
  end

  def append_audit!(store, event, payload = {})
    store['audit_log'] ||= []
    store['audit_log'] << payload.merge(
      'id' => SecureRandom.hex(8),
      'event' => event,
      'at' => now_iso
    )
  end

  def snapshot_for_revision(recipe)
    recipe.reject { |key, _value| key == 'revisions' }
  end

  def searchable_blob(recipe)
    normalized([
      recipe['slug'],
      recipe['title'],
      recipe['subtitle'],
      recipe['summary'],
      recipe['description'],
      recipe['category'],
      recipe['status'],
      recipe['access'],
      recipe.dig('submitted_by', 'name'),
      recipe['search_terms']
    ].flatten.join(' '))
  end

  def normalized(value)
    value.to_s.downcase.unicode_normalize(:nfkd).gsub(/\p{Mn}/, '')
  end

  def blank?(value)
    value.to_s.strip.empty?
  end

  def now_iso
    Time.now.utc.iso8601
  end
end
