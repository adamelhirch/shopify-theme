require 'json'
require 'securerandom'
require 'sqlite3'
require 'time'

class SqlRecipeStore
  ALLOWED_STATUSES = %w[pending approved rejected archived draft].freeze
  ALLOWED_ACCESS = %w[free member].freeze

  attr_reader :path

  def initialize(path)
    @path = path
    ensure_database!
  end

  def backend
    'sqlite'
  end

  def all(filters = {})
    recipes = database.execute('select payload from recipes').map { |row| parse_json(row[0]) }

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
      recipes = recipes.select { |recipe| searchable_blob(recipe).include?(needle) }
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
    row = database.get_first_row('select payload from recipes where slug = ?', slug)
    row ? parse_json(row[0]) : nil
  end

  def revision_history(slug)
    recipe_id = recipe_id_for_slug(slug)
    database.execute(
      'select payload from recipe_revisions where recipe_id = ? order by created_at desc',
      recipe_id
    ).map { |row| parse_json(row[0]) }
  end

  def publication_history(limit = 25)
    database.execute(
      'select payload from publications order by created_at desc limit ?',
      Integer(limit)
    ).map { |row| parse_json(row[0]) }
  end

  def audit_log(limit = 50)
    database.execute(
      'select payload from audit_log order by created_at desc limit ?',
      Integer(limit)
    ).map { |row| parse_json(row[0]) }
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
      database_path: path
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

    database.execute(
      'insert into publications (id, actor_name, published_count, output, created_at, payload) values (?, ?, ?, ?, ?, ?)',
      entry['id'],
      actor,
      published_count,
      output,
      entry['published_at'],
      JSON.generate(entry)
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
    row = database.get_first_row('select id from recipes where slug = ?', slug)
    raise KeyError, 'recipe not found' unless row

    row[0]
  end

  def persist_recipe!(recipe)
    recipe_id = recipe['id'] || recipe_id_for_slug(recipe['slug']) rescue SecureRandom.uuid
    recipe['id'] = recipe_id

    database.execute('delete from recipe_revisions where recipe_id = ?', recipe_id)
    database.execute(
      'insert into recipes (id, slug, status, access, title, submitted_at, validated_at, updated_at, payload) ' \
      'values (?, ?, ?, ?, ?, ?, ?, ?, ?) ' \
      'on conflict(id) do update set slug = excluded.slug, status = excluded.status, access = excluded.access, title = excluded.title, submitted_at = excluded.submitted_at, validated_at = excluded.validated_at, updated_at = excluded.updated_at, payload = excluded.payload',
      recipe_id,
      recipe['slug'],
      recipe['status'],
      recipe['access'],
      recipe['title'],
      recipe['submitted_at'],
      recipe['validated_at'],
      recipe['updated_at'],
      JSON.generate(recipe)
    )

    Array(recipe['revisions']).each do |revision|
      created_at = revision['at'] || now_iso
      database.execute(
        'insert into recipe_revisions (id, recipe_id, actor_name, event, created_at, payload) values (?, ?, ?, ?, ?, ?)',
        revision['id'] || SecureRandom.uuid,
        recipe_id,
        revision['actor'],
        revision['event'],
        created_at,
        JSON.generate(revision)
      )
    end
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

    database.execute(
      'insert into audit_log (id, actor_name, recipe_slug, event, created_at, payload) values (?, ?, ?, ?, ?, ?)',
      entry['id'],
      entry['actor'],
      entry['slug'],
      entry['event'],
      entry['at'],
      JSON.generate(entry)
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
    result['tags'] ||= []
    result['collections'] ||= []
    result['product'] ||= {}
    result['products'] ||= []
    result['difficulty'] ||= { 'value' => 'facile', 'label' => 'Facile' }
    result['timing'] ||= {}
    result['hero'] ||= {}
    result['seo'] ||= {}
    result['seo']['keywords'] ||= []
    result['seo']['body_sections'] ||= []
    result['seo']['faq'] ||= []
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
    value.to_s.encode('UTF-8', invalid: :replace, undef: :replace, replace: '').downcase.unicode_normalize(:nfkd).gsub(/\p{Mn}/, '')
  end

  def parse_json(value)
    JSON.parse(value.to_s.encode('UTF-8', invalid: :replace, undef: :replace, replace: ''))
  end

  def database
    @database ||= begin
      db = SQLite3::Database.new(path)
      db.results_as_hash = false
      db.busy_timeout = 5000
      db
    end
  end

  def ensure_database!
    database.execute_batch <<~SQL
      create table if not exists recipes (
        id text primary key,
        slug text not null unique,
        status text not null,
        access text not null,
        title text not null,
        submitted_at text,
        validated_at text,
        updated_at text,
        payload text not null
      );

      create index if not exists recipes_status_idx on recipes(status);
      create index if not exists recipes_access_idx on recipes(access);

      create table if not exists recipe_revisions (
        id text primary key,
        recipe_id text not null,
        actor_name text,
        event text not null,
        created_at text not null,
        payload text not null
      );

      create index if not exists recipe_revisions_recipe_idx on recipe_revisions(recipe_id, created_at desc);

      create table if not exists publications (
        id text primary key,
        actor_name text,
        published_count integer not null default 0,
        output text,
        created_at text not null,
        payload text not null
      );

      create table if not exists audit_log (
        id text primary key,
        actor_name text,
        recipe_slug text,
        event text not null,
        created_at text not null,
        payload text not null
      );

      create index if not exists audit_log_event_idx on audit_log(event, created_at desc);
    SQL
  end

  def blank?(value)
    value.to_s.strip.empty?
  end

  def now_iso
    Time.now.utc.iso8601
  end
end
