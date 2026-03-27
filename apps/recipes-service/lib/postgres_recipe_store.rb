require 'json'
require 'securerandom'
require 'time'

begin
  require 'pg'
rescue LoadError
  # Loaded lazily by the factory; raise a friendlier error at initialization time.
end

class PostgresRecipeStore
  ALLOWED_STATUSES = %w[pending approved rejected archived draft].freeze
  ALLOWED_ACCESS = %w[free member].freeze

  attr_reader :database_url, :schema_path

  def initialize(database_url:, schema_path:)
    unless defined?(PG)
      raise LoadError, 'pg gem is required for VD_RECIPES_STORE=postgres'
    end

    @database_url = database_url
    @schema_path = schema_path
    ensure_database!
  end

  def backend
    'postgres'
  end

  def all(filters = {})
    sql = +'select payload::text from recipes where 1=1'
    params = []

    if filters[:status]
      params << filters[:status]
      sql << " and status = $#{params.length}"
    end

    if filters[:access]
      params << filters[:access]
      sql << " and access = $#{params.length}"
    end

    if filters[:submitted_by_type]
      params << filters[:submitted_by_type]
      sql << " and submitted_by_type = $#{params.length}"
    end

    rows = connection.exec_params(sql, params).map { |row| parse_json(row['payload']) }

    if filters[:query]
      needle = normalized(filters[:query])
      rows = rows.select { |recipe| searchable_blob(recipe).include?(needle) }
    end

    rows.sort_by do |recipe|
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
    row = connection.exec_params('select payload::text as payload from recipes where slug = $1 limit 1', [slug]).first
    row ? parse_json(row['payload']) : nil
  end

  def revision_history(slug)
    recipe_id = recipe_id_for_slug(slug)
    connection.exec_params(
      'select payload::text as payload from recipe_revisions where recipe_id = $1 order by created_at desc',
      [recipe_id]
    ).map { |row| parse_json(row['payload']) }
  end

  def publication_history(limit = 25)
    connection.exec_params(
      'select payload::text as payload from publications order by created_at desc limit $1',
      [Integer(limit)]
    ).map { |row| parse_json(row['payload']) }
  end

  def audit_log(limit = 50)
    connection.exec_params(
      'select payload::text as payload from audit_log order by created_at desc limit $1',
      [Integer(limit)]
    ).map { |row| parse_json(row['payload']) }
  end

  def dashboard_summary
    recipes = all

    {
      total: recipes.length,
      approved: recipes.count { |recipe| recipe['status'] == 'approved' },
      pending: recipes.count { |recipe| recipe['status'] == 'pending' },
      rejected: recipes.count { |recipe| recipe['status'] == 'rejected' },
      archived: recipes.count { |recipe| recipe['status'] == 'archived' },
      member: recipes.count { |recipe| recipe['access'] == 'member' },
      free: recipes.count { |recipe| recipe['access'] == 'free' },
      last_publication: publication_history(1).first,
      backend: backend,
      database_path: database_url
    }
  end

  def create_submission(payload, actor: nil)
    create_record(payload, actor: actor, default_status: 'pending', audit_event: 'submission_created')
  end

  def create_recipe(payload, actor:)
    create_record(payload, actor: actor, default_status: 'draft', audit_event: 'recipe_created')
  end

  def update_recipe(slug, payload, actor:)
    recipe = find!(slug)
    clean_payload = normalize_recipe_payload(payload, require_slug: false)
    protected_fields = %w[slug created_at revisions moderation_notes submitted_at]

    clean_payload.each do |key, value|
      next if protected_fields.include?(key)

      recipe[key] = value
    end

    recipe['updated_at'] = now_iso
    append_revision!(recipe, actor: actor, event: 'updated')
    persist_recipe!(recipe)
    append_audit!('recipe_updated', slug: slug, actor: actor)
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
    entry = {
      'id' => SecureRandom.uuid,
      'published_at' => now_iso,
      'actor' => actor,
      'published_count' => published_count,
      'output' => output
    }

    connection.exec_params(
      'insert into publications (id, actor_name, published_count, output, created_at, payload) values ($1, $2, $3, $4, $5, $6::jsonb)',
      [
        entry['id'],
        actor,
        published_count,
        output,
        entry['published_at'],
        JSON.generate(entry)
      ]
    )
    append_audit!('registry_exported', actor: actor, published_count: published_count)
    entry
  end

  private

  def create_record(payload, actor:, default_status:, audit_event:)
    slug = payload.fetch('slug')
    raise ArgumentError, 'slug already exists' if find(slug)

    now = now_iso
    record = normalize_recipe_payload(payload).merge(
      'status' => payload['status'] || default_status,
      'submitted_at' => now,
      'created_at' => now,
      'updated_at' => now,
      'validated_at' => nil,
      'validated_by' => nil,
      'moderation_notes' => [],
      'revisions' => []
    )

    append_revision!(record, actor: actor || record.dig('submitted_by', 'name') || 'submission', event: 'created')
    persist_recipe!(record)
    append_audit!(audit_event, slug: slug, actor: actor || record.dig('submitted_by', 'name'))
    record
  end

  def update_status(slug, status, reviewer, note: nil)
    raise ArgumentError, 'invalid status' unless ALLOWED_STATUSES.include?(status)

    recipe = find!(slug)
    recipe['status'] = status
    recipe['validated_at'] = now_iso
    recipe['validated_by'] = reviewer
    recipe['updated_at'] = now_iso
    recipe['moderation_notes'] ||= []
    recipe['moderation_notes'] << {
      'at' => now_iso,
      'actor' => reviewer,
      'status' => status,
      'note' => note.to_s.strip
    }

    append_revision!(recipe, actor: reviewer, event: "status_#{status}")
    persist_recipe!(recipe)
    append_audit!('recipe_status_changed', slug: slug, actor: reviewer, status: status)
    recipe
  end

  def find!(slug)
    find(slug) || raise(KeyError, 'recipe not found')
  end

  def recipe_id_for_slug(slug)
    row = connection.exec_params('select id::text as id from recipes where slug = $1 limit 1', [slug]).first
    raise KeyError, 'recipe not found' unless row

    row['id']
  end

  def persist_recipe!(recipe)
    recipe_id = recipe['id'] || safe_recipe_id(recipe['slug']) || SecureRandom.uuid
    recipe['id'] = recipe_id

    connection.exec('begin')
    connection.exec_params('delete from recipe_revisions where recipe_id = $1::uuid', [recipe_id])
    connection.exec_params(
      'insert into recipes (id, slug, status, access, title, page_url, eyebrow, subtitle, summary, description, category, difficulty, timing, serves, hero, search_terms, product, ingredient_groups, steps, tips, seo, submitted_by_name, submitted_by_type, submitted_at, validated_by_name, validated_at, payload, created_at, updated_at) ' \
      'values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22, $23, $24::timestamptz, $25, $26::timestamptz, $27::jsonb, $28::timestamptz, $29::timestamptz) ' \
      'on conflict (id) do update set slug = excluded.slug, status = excluded.status, access = excluded.access, title = excluded.title, page_url = excluded.page_url, eyebrow = excluded.eyebrow, subtitle = excluded.subtitle, summary = excluded.summary, description = excluded.description, category = excluded.category, difficulty = excluded.difficulty, timing = excluded.timing, serves = excluded.serves, hero = excluded.hero, search_terms = excluded.search_terms, product = excluded.product, ingredient_groups = excluded.ingredient_groups, steps = excluded.steps, tips = excluded.tips, seo = excluded.seo, submitted_by_name = excluded.submitted_by_name, submitted_by_type = excluded.submitted_by_type, submitted_at = excluded.submitted_at, validated_by_name = excluded.validated_by_name, validated_at = excluded.validated_at, payload = excluded.payload, updated_at = excluded.updated_at',
      [
        recipe_id,
        recipe['slug'],
        recipe['status'],
        recipe['access'],
        recipe['title'],
        recipe['page_url'],
        recipe['eyebrow'],
        recipe['subtitle'],
        recipe['summary'],
        recipe['description'],
        recipe['category'],
        JSON.generate(recipe['difficulty'] || {}),
        JSON.generate(recipe['timing'] || {}),
        recipe['serves'],
        JSON.generate(recipe['hero'] || {}),
        JSON.generate(recipe['search_terms'] || []),
        JSON.generate(recipe['product'] || {}),
        JSON.generate(recipe['ingredient_groups'] || []),
        JSON.generate(recipe['steps'] || []),
        JSON.generate(recipe['tips'] || []),
        JSON.generate(recipe['seo'] || {}),
        recipe.dig('submitted_by', 'name'),
        recipe.dig('submitted_by', 'type'),
        recipe['submitted_at'],
        recipe['validated_by'],
        recipe['validated_at'],
        JSON.generate(recipe),
        recipe['created_at'],
        recipe['updated_at']
      ]
    )
    Array(recipe['revisions']).each do |revision|
      created_at = revision['at'] || now_iso
      connection.exec_params(
        'insert into recipe_revisions (id, recipe_id, actor_name, event, snapshot, payload, created_at) values ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7::timestamptz)',
        [
          revision['id'] || SecureRandom.uuid,
          recipe_id,
          revision['actor'],
          revision['event'],
          JSON.generate(revision['snapshot'] || {}),
          JSON.generate(revision),
          created_at
        ]
      )
    end
    connection.exec('commit')
  rescue StandardError
    connection.exec('rollback')
    raise
  end

  def safe_recipe_id(slug)
    recipe_id_for_slug(slug)
  rescue KeyError
    nil
  end

  def append_revision!(recipe, actor:, event:)
    recipe['revisions'] ||= []
    recipe['revisions'] << {
      'id' => SecureRandom.uuid,
      'at' => now_iso,
      'actor' => actor,
      'event' => event,
      'snapshot' => recipe.reject { |key, _value| key == 'revisions' }
    }
  end

  def append_audit!(event, payload = {})
    entry = payload.merge(
      'id' => SecureRandom.uuid,
      'event' => event,
      'at' => now_iso
    )

    recipe_id = safe_recipe_id(entry['slug'])
    connection.exec_params(
      'insert into audit_log (id, actor_name, recipe_id, recipe_slug, event, payload, created_at) values ($1::uuid, $2, $3::uuid, $4, $5, $6::jsonb, $7::timestamptz)',
      [
        entry['id'],
        entry['actor'],
        recipe_id,
        entry['slug'],
        entry['event'],
        JSON.generate(entry),
        entry['at']
      ]
    )
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

  def parse_json(value)
    JSON.parse(value)
  end

  def connection
    @connection ||= PG.connect(database_url)
  end

  def ensure_database!
    return if connection.exec("select to_regclass('public.recipes') as name").first['name']

    connection.exec(File.read(schema_path))
  end

  def blank?(value)
    value.to_s.strip.empty?
  end

  def now_iso
    Time.now.utc.iso8601
  end
end
