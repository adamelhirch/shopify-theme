#!/usr/bin/env ruby
# frozen_string_literal: true

require 'cgi'
require 'json'
require 'openssl'
require 'open3'
require 'time'
require 'uri'
require 'webrick'
require 'English'
require_relative 'lib/actor_registry'
require_relative 'lib/shopify_customer_recipe_shelf'
require_relative 'lib/shopify_page_publisher'
require_relative 'lib/shopify_preview_manager'
require_relative 'lib/studio_content_registry'
require_relative 'lib/studio_settings'
require_relative 'lib/store_factory'

ROOT = File.expand_path(__dir__)
REPO_ROOT = File.expand_path('..', ROOT)
STORE = StoreFactory.build(root: ROOT)
PORT = Integer(ENV.fetch('VD_RECIPES_PORT', '4567'))
ADMIN_TOKEN = ENV.fetch('VD_RECIPES_ADMIN_TOKEN', 'change-me')
ACTORS = ActorRegistry.new(File.join(ROOT, 'data', 'actors.json'), fallback_admin_token: ADMIN_TOKEN)
EXPORT_SCRIPT = File.expand_path('../../bin/export-recipes-store.rb', __dir__)
SHOPIFY_PUBLISHER = ShopifyPagePublisher.build_from_env
SHOPIFY_CUSTOMER_SHELF = ShopifyCustomerRecipeShelf.build_from_env
STUDIO_SETTINGS = StudioSettings.new(File.join(ROOT, 'data', 'studio_settings.json'))
STUDIO_CONTENT = StudioContentRegistry.new(File.join(ROOT, 'data', 'studio_content.json'))
PREVIEW_MANAGER = ShopifyPreviewManager.build_from_env(settings: STUDIO_SETTINGS)
SESSION_COOKIE = 'vd_recipes_admin_session'
SESSION_SECRET = ENV.fetch('VD_RECIPES_SESSION_SECRET', 'vd-recipes-local-session-secret')
SESSION_TTL = Integer(ENV.fetch('VD_RECIPES_SESSION_TTL', '43200'))

def json_response(response, status, payload)
  response.status = status
  response['Content-Type'] = 'application/json'
  response.body = JSON.pretty_generate(payload)
end

def html_response(response, status, html)
  response.status = status
  response['Content-Type'] = 'text/html; charset=utf-8'
  response.body = html
end

def parse_body(request)
  return {} if request.body.to_s.strip.empty?

  JSON.parse(request.body)
rescue JSON::ParserError
  raise ArgumentError, 'invalid json body'
end

def request_token(request)
  bearer = request['Authorization'].to_s[/\ABearer\s+(.+)\z/i, 1]
  bearer || request['X-VD-Token'] || request['X-VD-Admin-Token'] || request.query['token']
end

def parse_cookies(request)
  request.header.fetch('cookie', []).flat_map { |value| value.split(/;\s*/) }.each_with_object({}) do |pair, cookies|
    key, value = pair.split('=', 2)
    cookies[key] = value if key && value
  end
end

def sign_session_payload(payload)
  OpenSSL::HMAC.hexdigest('SHA256', SESSION_SECRET, payload)
end

def secure_compare(a, b)
  return false if a.to_s.empty? || b.to_s.empty? || a.bytesize != b.bytesize

  left = a.unpack("C#{a.bytesize}")
  result = 0
  b.each_byte { |byte| result |= byte ^ left.shift }
  result.zero?
end

def build_session_cookie(actor)
  expires_at = Time.now.to_i + SESSION_TTL
  payload = "#{actor['id']}|#{expires_at}"
  signature = sign_session_payload(payload)
  "#{payload}|#{signature}"
end

def current_admin_session_actor(request)
  raw = parse_cookies(request)[SESSION_COOKIE]
  return nil if raw.to_s.empty?

  actor_id, expires_at, signature = raw.split('|', 3)
  return nil if actor_id.to_s.empty? || expires_at.to_s.empty? || signature.to_s.empty?

  payload = "#{actor_id}|#{expires_at}"
  return nil unless secure_compare(signature, sign_session_payload(payload))
  return nil if Time.now.to_i >= expires_at.to_i

  actor = ACTORS.find(actor_id)
  return nil unless actor && actor['active']
  return nil unless ACTORS.allowed?(actor, 'admin')

  actor
end

def set_admin_session(response, actor)
  cookie = "#{SESSION_COOKIE}=#{build_session_cookie(actor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=#{SESSION_TTL}"
  response.cookies << WEBrick::Cookie.parse_set_cookie(cookie)
end

def clear_admin_session(response)
  response.cookies << WEBrick::Cookie.parse_set_cookie("#{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
end

def current_actor(request)
  admin_session_actor = current_admin_session_actor(request)
  return admin_session_actor if admin_session_actor

  token = request_token(request)
  return nil if token.to_s.strip.empty?

  ACTORS.authenticate(token)
end

def actor_name(request, actor = nil)
  actor ||= current_actor(request)
  request['X-VD-Reviewer'] || actor&.dig('name') || 'system'
end

def unauthorized!(response)
  json_response(response, 401, { error: 'unauthorized' })
end

def forbidden!(response, permission)
  json_response(response, 403, { error: 'forbidden', permission: permission })
end

def require_permission!(request, response, permission)
  actor = current_actor(request)
  unless actor
    unauthorized!(response)
    return nil
  end

  unless ACTORS.allowed?(actor, permission)
    forbidden!(response, permission)
    return nil
  end

  actor
end

def run_export(actor)
  output, status = Open3.capture2e('ruby', EXPORT_SCRIPT)
  publication = STORE.record_publication(
    actor: actor,
    output: output.strip,
    published_count: STORE.published.length
  )

  {
    ok: status.success?,
    output: output.strip,
    publication: publication
  }
end

def publish_to_shopify(recipe, actor:, export_registry: false)
  result = SHOPIFY_PUBLISHER.publish(recipe)
  publication_state = {
    'id' => result[:page_id],
    'handle' => result[:handle],
    'page_url' => result[:page_url],
    'online_store_url' => result[:online_store_url],
    'shop_domain' => result[:shop_domain],
    'api_version' => result[:api_version],
    'last_action' => result[:action],
    'last_published_at' => Time.now.utc.iso8601
  }

  updated = STORE.update_recipe(
    recipe['slug'],
    recipe.merge(
      'page_url' => result[:page_url],
      'shopify_page' => publication_state
    ),
    actor: actor
  )

  export_result = export_registry ? run_export(actor) : nil

  {
    recipe: updated,
    shopify: result,
    export: export_result
  }
end

def sync_customer_recipe_shelf(email:, favorites:, history:, actor:)
  SHOPIFY_CUSTOMER_SHELF.sync(
    email: email,
    favorites: favorites,
    history: history,
    actor: actor
  )
end

def html_escape(value)
  CGI.escapeHTML(value.to_s)
end

def public_actor(actor)
  actor.reject { |key, _value| %w[token token_digest].include?(key) }
end

def html_redirect(response, location)
  response.status = 303
  response['Location'] = location
  response.body = ''
end

def admin_flash(level, message)
  { 'level' => level, 'message' => message }
end

def admin_filters(request)
  {
    recipe: request.query['recipe'],
    status: request.query['status'],
    access: request.query['access'],
    query: request.query['q'],
    flash: request.query['flash'],
    level: request.query['level']
  }
end

def admin_url(recipe: nil, status: nil, access: nil, query: nil, flash: nil, level: nil)
  params = {
    recipe: recipe,
    status: status,
    access: access,
    q: query,
    flash: flash,
    level: level
  }.reject { |_key, value| value.to_s.strip.empty? }

  "/admin?#{URI.encode_www_form(params)}"
end

def studio_meta_payload
  {
    ok: true,
    service: 'recipes-service',
    version: 4,
    backend: STORE.respond_to?(:backend) ? STORE.backend : 'json',
    modules: STUDIO_SETTINGS.module_list,
    content_modules: STUDIO_CONTENT.all.keys,
    shopify: PREVIEW_MANAGER.metadata,
    repository_root: REPO_ROOT,
    settings_path: STUDIO_SETTINGS.path
  }
end

def studio_module_payload(module_key)
  module_data = STUDIO_CONTENT.fetch(module_key) || {}

  stats =
    case module_key.to_s
    when 'recipes'
      dashboard = STORE.dashboard_summary
      [
        { 'label' => 'Total', 'value' => dashboard[:total].to_i },
        { 'label' => 'Approuvees', 'value' => dashboard[:approved].to_i },
        { 'label' => 'Preview', 'value' => 'auto' }
      ]
    when 'wiki'
      [
        { 'label' => 'Templates', 'value' => 1 },
        { 'label' => 'Clusters cibles', 'value' => 6 },
        { 'label' => 'Etat', 'value' => 'fondation' }
      ]
    when 'pages'
      [
        { 'label' => 'Templates', 'value' => 3 },
        { 'label' => 'Priorites', 'value' => 4 },
        { 'label' => 'Etat', 'value' => 'preparation' }
      ]
    else
      []
    end

  {
    'key' => module_key.to_s,
    'headline' => module_data['headline'],
    'body' => module_data['body'],
    'pillars' => Array(module_data['pillars']),
    'collections' => Array(module_data['collections']),
    'roadmap' => Array(module_data['roadmap']),
    'quick_actions' => Array(module_data['quick_actions']),
    'stats' => stats
  }
end

def admin_login_page(flash: nil)
  <<~HTML
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Recipes Service Login</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: radial-gradient(circle at top, rgba(255,255,255,0.75), transparent 30%), linear-gradient(180deg, #f6f1ea, #ece3d7);
            font-family: ui-sans-serif, system-ui, sans-serif;
            color: #161616;
          }
          .card {
            width: min(520px, calc(100vw - 32px));
            padding: 28px;
            border: 1px solid rgba(16,16,16,0.08);
            border-radius: 28px;
            background: rgba(255,255,255,0.84);
            box-shadow: 0 24px 60px rgba(0,0,0,0.08);
            backdrop-filter: blur(12px);
          }
          label { display: grid; gap: 8px; color: rgba(22,22,22,0.66); }
          input, button {
            width: 100%;
            padding: 14px 16px;
            border-radius: 16px;
            border: 1px solid rgba(16,16,16,0.1);
            font: inherit;
          }
          button { background: #161616; color: #fff; cursor: pointer; }
          .flash {
            margin-bottom: 16px;
            padding: 12px 14px;
            border-radius: 16px;
            background: rgba(128,35,35,0.09);
          }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>Connexion editoriale</h1>
          <p>Ouvrez la console recette avec un token autorise. Une session locale signee sera ensuite conservee en cookie.</p>
          #{flash ? "<div class=\"flash\">#{html_escape(flash)}</div>" : ''}
          <form method="post" action="/admin/login">
            <label>Token
              <input type="password" name="token" placeholder="Token admin ou editor">
            </label>
            <button type="submit">Entrer dans la console</button>
          </form>
        </section>
      </body>
    </html>
  HTML
end

def pretty_json(value)
  JSON.pretty_generate(value || [])
end

def parse_json_field(value, fallback)
  stripped = value.to_s.strip
  return fallback if stripped.empty?

  JSON.parse(stripped)
rescue JSON::ParserError
  raise ArgumentError, 'invalid json field in admin form'
end

def csv_terms(value)
  value.to_s.split(/[\n,]/).map(&:strip).reject(&:empty?)
end

def slugify(value)
  value.to_s.encode('UTF-8', invalid: :replace, undef: :replace, replace: '').downcase.unicode_normalize(:nfkd).gsub(/\p{Mn}/, '')
    .gsub(/[^a-z0-9]+/, '-')
    .gsub(/\A-+|-+\z/, '')
end

def labelize(value)
  value.to_s.split(/[-_]/).reject(&:empty?).map(&:capitalize).join(' ')
end

RECIPE_TEMPLATES = {
  'recipe_premium' => {
    'label' => 'Recette premium',
    'status' => 'draft',
    'access' => 'member',
    'eyebrow' => 'Recette signature',
    'category' => 'Recettes',
    'difficulty' => { 'value' => 'facile', 'label' => 'Facile' },
    'collections' => %w[recettes-premium],
    'tags' => %w[recette premium vanille],
    'tips' => [
      { 'title' => 'Texture', 'body' => 'Precisez le bon repere visuel pour rassurer pendant la preparation.' },
      { 'title' => 'Cuisson', 'body' => 'Ajoutez un garde-fou simple sur temperature, temps ou geste a surveiller.' }
    ],
    'seo' => {
      'body_sections' => [
        { 'title' => 'Pourquoi cette recette fonctionne', 'body' => '' },
        { 'title' => 'Erreurs a eviter', 'body' => '' },
        { 'title' => 'Conservation et service', 'body' => '' }
      ],
      'faq' => [
        { 'question' => '', 'answer' => '' },
        { 'question' => '', 'answer' => '' }
      ]
    }
  },
  'recipe_free' => {
    'label' => 'Recette libre',
    'status' => 'draft',
    'access' => 'free',
    'eyebrow' => 'Recette libre',
    'category' => 'Recettes',
    'difficulty' => { 'value' => 'facile', 'label' => 'Facile' },
    'collections' => %w[recettes-gratuites],
    'tags' => %w[recette libre vanille]
  },
  'guide' => {
    'label' => 'Guide / astuce',
    'status' => 'draft',
    'access' => 'free',
    'eyebrow' => 'Guide libre',
    'category' => 'Guides',
    'difficulty' => { 'value' => 'intermediaire', 'label' => 'Intermediaire' },
    'collections' => %w[guides],
    'tags' => %w[guide usage vanille],
    'timing' => { 'prep' => 'Lecture', 'cook' => '', 'rest' => '', 'total' => '6 min' }
  },
  'accord' => {
    'label' => 'Accord / pairing',
    'status' => 'draft',
    'access' => 'free',
    'eyebrow' => 'Accord',
    'category' => 'Accords',
    'difficulty' => { 'value' => 'intermediaire', 'label' => 'Intermediaire' },
    'collections' => %w[accords],
    'tags' => %w[accord pairing vanille]
  }
}.freeze

def deep_clone(value)
  JSON.parse(JSON.generate(value))
end

def recipe_template_payload(template_key)
  template = RECIPE_TEMPLATES[template_key.to_s]
  payload = template ? deep_clone(template) : {}
  payload['title'] ||= template && template['label']
  payload
end

def smart_recipe_defaults(payload)
  draft = deep_clone(payload || {})
  title = draft['title'].to_s.strip
  slug = draft['slug'].to_s.strip
  category = draft['category'].to_s.strip

  draft['slug'] = slug.empty? ? slugify(title) : slugify(slug)
  draft['page_url'] = "/pages/#{draft['slug']}" unless draft['slug'].to_s.empty?
  draft['eyebrow'] = category.empty? ? (draft['eyebrow'] || 'Recette') : draft['eyebrow']

  seo = draft['seo'] ||= {}
  seo['title'] = "#{title} | Vanille Desire" if seo['title'].to_s.strip.empty? && !title.empty?
  if seo['description'].to_s.strip.empty?
    description_seed = draft['summary'].to_s.strip.empty? ? draft['description'].to_s.strip : draft['summary'].to_s.strip
    seo['description'] = description_seed[0, 156] unless description_seed.empty?
  end
  seo['keywords'] ||= []
  seo['keywords'] = (seo['keywords'] + [title, category, draft['access'], draft['eyebrow']]).map(&:to_s).map(&:strip).reject(&:empty?).uniq

  draft['search_terms'] ||= []
  draft['search_terms'] = (draft['search_terms'] + seo['keywords']).map(&:to_s).map(&:strip).reject(&:empty?).uniq
  draft['tags'] ||= []
  draft['tags'] = (draft['tags'] + [category, draft['access'], draft['difficulty'].to_h['value']]).map(&:to_s).map(&:strip).reject(&:empty?).uniq
  draft['collections'] ||= []
  draft['collections'] = draft['collections'].map(&:to_s).map(&:strip).reject(&:empty?).uniq
  draft['products'] ||= []
  draft
end

def duplicate_recipe_payload(recipe)
  clone = deep_clone(recipe || {})
  %w[revisions moderation_notes created_at updated_at submitted_at validated_at validated_by].each { |key| clone.delete(key) }
  clone['slug'] = "#{clone['slug']}-copy" if clone['slug']
  clone['title'] = "#{clone['title']} copie" if clone['title']
  clone['status'] = 'draft'
  clone['page_url'] = "/pages/#{clone['slug']}" if clone['slug']
  clone
end

def split_import_sections(text)
  current = 'root'
  sections = Hash.new { |hash, key| hash[key] = [] }
  key_map = {
    'titre' => 'title',
    'title' => 'title',
    'sous-titre' => 'subtitle',
    'sous titre' => 'subtitle',
    'subtitle' => 'subtitle',
    'resume' => 'summary',
    'summary' => 'summary',
    'description' => 'description',
    'categorie' => 'category',
    'category' => 'category',
    'acces' => 'access',
    'access' => 'access',
    'difficulte' => 'difficulty',
    'difficulty' => 'difficulty',
    'temps' => 'timing',
    'timing' => 'timing',
    'timings' => 'timing',
    'portions' => 'serves',
    'serves' => 'serves',
    'tags' => 'tags',
    'collections' => 'collections',
    'collection' => 'collections',
    'produits' => 'products',
    'produit' => 'products',
    'products' => 'products',
    'product' => 'products',
    'sources' => 'sources',
    'source' => 'sources',
    'ingredients' => 'ingredients',
    'ingredient' => 'ingredients',
    'etapes' => 'steps',
    'etape' => 'steps',
    'steps' => 'steps',
    'step' => 'steps',
    'preparation' => 'steps',
    'astuces' => 'tips',
    'astuce' => 'tips',
    'tips' => 'tips',
    'tip' => 'tips',
    'seo' => 'seo',
    'keywords' => 'seo',
    'mots-cles' => 'seo',
    'mots cles' => 'seo',
    'faq' => 'faq'
  }

  normalized_text = text.to_s.encode('UTF-8', invalid: :replace, undef: :replace, replace: '')
  normalized_text = normalized_text.gsub(/\s+(?=(Titre|Title|Sous-titre|Sous titre|Subtitle|Summary|Resume|Description|Access|Acces|Category|Categorie|Serves|Portions|Timing|Temps|Difficulty|Difficulte|Tags|Collections?|Produits?|Products?|Ingredients?|Etapes?|Steps?|Preparation|Tips?|Astuces?|FAQ)\s*:)/i, "\n")

  normalized_text.each_line do |raw_line|
    line = raw_line.strip
    next if line.empty?

    heading = line.sub(/\A#+\s*/, '')
    case heading.downcase
    when /\Atitre\s*:?\z/, /\Atitle\s*:?\z/
      current = 'title'
      next
    when /\Asous[- ]titre\s*:?\z/, /\Asubtitle\s*:?\z/
      current = 'subtitle'
      next
    when /\Aresume\s*:?\z/, /\Asummary\s*:?\z/
      current = 'summary'
      next
    when /\Adescription\s*:?\z/
      current = 'description'
      next
    when /\Acategory\s*:?\z/, /\Acategorie\s*:?\z/
      current = 'category'
      next
    when /\Aacces\s*:?\z/, /\Aaccess\s*:?\z/
      current = 'access'
      next
    when /\Adifficulte\s*:?\z/, /\Adifficulty\s*:?\z/
      current = 'difficulty'
      next
    when /\Atemps\s*:?\z/, /\Atimings?\s*:?\z/
      current = 'timing'
      next
    when /\Aportions\s*:?\z/, /\Aserves\s*:?\z/
      current = 'serves'
      next
    when /\Atags\s*:?\z/
      current = 'tags'
      next
    when /\Acollections?\s*:?\z/
      current = 'collections'
      next
    when /\Aproduits?\s*:?\z/, /\Aproducts?\s*:?\z/
      current = 'products'
      next
    when /\Asources?\s*:?\z/, /\Asource\s*:?\z/
      current = 'sources'
      next
    when /\Aingredients?\s*:?\z/
      current = 'ingredients'
      next
    when /\Aetapes?\s*:?\z/, /\Asteps?\s*:?\z/, /\Apreparation\s*:?\z/
      current = 'steps'
      next
    when /\Aastuces?\s*:?\z/, /\Atips?\s*:?\z/
      current = 'tips'
      next
    when /\Aseo\s*:?\z/, /\Amots[- ]cles?\s*:?\z/, /\Akeywords?\s*:?\z/
      current = 'seo'
      next
    when /\Afaq\s*:?\z/
      current = 'faq'
      next
    end

    if line.include?(':')
      key, remainder = line.split(':', 2)
      normalized_key = key.to_s.downcase.strip
      mapped = key_map[normalized_key]
      if mapped
        current = mapped
        sections[current] << remainder.to_s.strip unless remainder.to_s.strip.empty?
        next
      end
    end

    sections[current] << line
  end

  sections
end

def parse_import_list(lines)
  lines.flat_map { |line| line.split(/[,|]/) }.map(&:strip).reject(&:empty?)
end

def parse_import_timing(lines)
  timing = {}
  lines.each do |line|
    line.scan(/(prep|preparation|cook|cuisson|rest|repos|total)\s*[:=-]\s*([^,;]+)/i).each do |label, value|
      normalized = case label.downcase
                   when 'prep', 'preparation' then 'prep'
                   when 'cook', 'cuisson' then 'cook'
                   when 'rest', 'repos' then 'rest'
                   else 'total'
                   end
      timing[normalized] = value.to_s.strip
    end
  end
  timing
end

def parse_import_ingredient_groups(lines)
  groups = []
  current = nil

  lines.each do |line|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?

    if stripped.end_with?(':') && !stripped.match?(/\d/)
      current = { 'title' => stripped.delete_suffix(':').strip, 'items' => [] }
      groups << current
      next
    end

    current ||= begin
      group = { 'title' => 'Ingredients', 'items' => [] }
      groups << group
      group
    end

    item_line = stripped.sub(/\A\d+[.)]\s*/, '')
    quantity = ''
    unit = ''
    name = item_line

    if item_line =~ /\A(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*([[:alpha:]%]+)?\s+(.*)\z/
      quantity = Regexp.last_match(1).tr(',', '.')
      unit = Regexp.last_match(2).to_s.strip
      name = Regexp.last_match(3).strip
    end

    name = name.sub(/\Ade\s+/i, '')

    note = ''
    if name.include?(' - ')
      name, note = name.split(' - ', 2)
    elsif name.include?(' — ')
      name, note = name.split(' — ', 2)
    end

    current['items'] << {
      'id' => slugify("#{current['title']}-#{name}"),
      'quantity' => quantity,
      'unit' => unit,
      'name' => name.strip,
      'note' => note.to_s.strip
    }.reject { |_key, value| value.to_s.empty? }
  end

  groups
end

def parse_import_steps(lines)
  steps = []

  lines.each_with_index do |line, index|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?

    stripped = stripped.sub(/\Aetape\s*\d+\s*[:.-]?\s*/i, '')
    stripped = stripped.sub(/\Astep\s*\d+\s*[:.-]?\s*/i, '')
    stripped = stripped.sub(/\A\d+[.)]\s*/, '')

    duration = stripped[/\(([^)]+min[^)]*)\)/i, 1]
    stripped = stripped.gsub(/\(([^)]+min[^)]*)\)/i, '').strip

    title, body = stripped.split(/\s+-\s+|\s+:\s+/, 2)
    title = title.to_s.strip
    body = body.to_s.strip

    if body.empty?
      sentences = stripped.split(/(?<=[.!?])\s+/)
      title = sentences.shift.to_s.strip
      body = sentences.join(' ').strip
    end

    title = "Etape #{index + 1}" if title.empty?
    body = stripped if body.empty?

    steps << {
      'id' => slugify("step-#{index + 1}-#{title}"),
      'title' => title,
      'duration' => duration.to_s.strip,
      'highlight' => index.zero? ? 'Base' : '',
      'body' => body
    }.reject { |_key, value| value.to_s.empty? }
  end

  steps
end

def parse_import_tips(lines)
  lines.map do |line|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?

    title, body = stripped.split(/\s*:\s*/, 2)
    if body.to_s.strip.empty?
      title = 'Repere'
      body = stripped
    end

    {
      'title' => title.to_s.strip,
      'body' => body.to_s.strip
    }
  end.compact
end

def parse_import_faq(lines)
  faqs = []
  current = nil

  lines.each do |line|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?

    if stripped.start_with?('Q:')
      current = { 'question' => stripped.sub(/\AQ:\s*/, '').strip, 'answer' => '' }
      faqs << current
    elsif stripped.start_with?('R:') || stripped.start_with?('A:')
      current ||= { 'question' => '', 'answer' => '' }
      current['answer'] = stripped.sub(/\A[RA]:\s*/, '').strip
      faqs << current unless faqs.include?(current)
    elsif current && current['answer'].to_s.empty?
      current['answer'] = stripped
    else
      question, answer = stripped.split(/\s+\?\s+/, 2)
      next unless answer

      faqs << { 'question' => "#{question.strip} ?", 'answer' => answer.strip }
    end
  end

  faqs.reject { |entry| entry['question'].to_s.empty? || entry['answer'].to_s.empty? }
end

def parse_source_lines(lines)
  lines.map do |line|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?

    title, url, license, note = stripped.split('|', 4).map { |entry| entry.to_s.strip }
    if url.to_s.empty? && stripped =~ %r{https?://}
      title = title.to_s.empty? ? stripped[%r{https?://[^ ]+}, 0].to_s : title
      url = stripped[%r{https?://[^ ]+}, 0].to_s
    end

    next if title.to_s.empty? && url.to_s.empty?

    {
      'title' => title,
      'url' => url,
      'license' => license,
      'note' => note
    }.reject { |_key, value| value.to_s.strip.empty? }
  end.compact
end

def source_lines_for_form(sources)
  Array(sources).map do |source|
    [
      source['title'],
      source['url'],
      source['license'],
      source['note']
    ].map(&:to_s).join(' | ').gsub(/\s+\|\s+\|\s*/, ' | ').sub(/\s+\|\s*\z/, '')
  end.join("\n")
end

def ingredient_groups_for_form(groups)
  Array(groups).flat_map do |group|
    lines = []
    title = group['title'].to_s.strip
    lines << "#{title}:" unless title.empty?
    Array(group['items']).each do |item|
      quantity = [item['quantity'], item['unit']].map(&:to_s).reject(&:empty?).join(' ')
      line = [quantity, item['name']].reject { |value| value.to_s.empty? }.join(' ').strip
      line = "#{line} - #{item['note']}" unless item['note'].to_s.strip.empty?
      lines << "- #{line}".strip
    end
    lines << ''
    lines
  end.join("\n").strip
end

def steps_for_form(steps)
  Array(steps).each_with_index.map do |step, index|
    [
      "#{index + 1}. #{step['title']}",
      step['duration'].to_s.strip.empty? ? nil : "Duree: #{step['duration']}",
      step['highlight'].to_s.strip.empty? ? nil : "Repere: #{step['highlight']}",
      step['body']
    ].compact.join(' | ')
  end.join("\n")
end

def tips_for_form(tips)
  Array(tips).map do |tip|
    title = tip['title'].to_s.strip
    body = tip['body'].to_s.strip
    title.empty? ? body : "#{title}: #{body}"
  end.join("\n")
end

def faq_for_form(faqs)
  Array(faqs).map do |faq|
    "#{faq['question']} | #{faq['answer']}"
  end.join("\n")
end

def body_sections_for_form(sections)
  Array(sections).map do |section|
    "#{section['title']} | #{section['body']}"
  end.join("\n")
end

def product_handles_for_form(products)
  Array(products).map { |product| product['handle'].to_s.strip }.reject(&:empty?).join("\n")
end

def story_media_for_form(media_items)
  Array(media_items).map do |item|
    [
      item['video_url'].to_s.strip.empty? ? 'image' : 'video',
      item['video_url'].to_s.strip.empty? ? item['image_url'] : item['video_url'],
      item['caption'],
      item['image_alt']
    ].map(&:to_s).join(' | ').gsub(/\s+\|\s+\|\s*/, ' | ').sub(/\s+\|\s*\z/, '')
  end.join("\n")
end

def step_media_for_form(steps)
  Array(steps).each_with_index.flat_map do |step, index|
    Array(step['media']).map do |item|
      [
        index + 1,
        item['video_url'].to_s.strip.empty? ? 'image' : 'video',
        item['video_url'].to_s.strip.empty? ? item['image_url'] : item['video_url'],
        item['caption'],
        item['image_alt']
      ].map(&:to_s).join(' | ').gsub(/\s+\|\s+\|\s*/, ' | ').sub(/\s+\|\s*\z/, '')
    end
  end.join("\n")
end

def primary_product_handle(recipe)
  primary = recipe.dig('product', 'handle').to_s.presence
  return primary if primary

  Array(recipe['products']).map { |item| item['handle'].to_s.strip }.find { |value| !value.empty? }.to_s
end

def parse_steps_lines(lines)
  lines.each_with_index.map do |line, index|
    stripped = line.sub(/\A\d+[.)]\s*/, '').strip
    next if stripped.empty?

    title, duration, highlight, body = stripped.split('|', 4).map { |entry| entry.to_s.strip }
    title = title.sub(/\ADuree:\s*/i, '').strip if title =~ /\ADuree:/i
    duration = duration.to_s.sub(/\ADuree:\s*/i, '').strip
    highlight = highlight.to_s.sub(/\ARepere:\s*/i, '').strip
    body = body.to_s.strip

    if body.empty? && title.include?(' | ')
      title, body = title.split(/\s+\|\s+/, 2)
    end

    {
      'id' => slugify("step-#{index + 1}-#{title}"),
      'title' => title.empty? ? "Etape #{index + 1}" : title,
      'duration' => duration,
      'highlight' => highlight,
      'body' => body.empty? ? title : body
    }.reject { |_key, value| value.to_s.strip.empty? }
  end.compact
end

def parse_faq_lines(lines)
  lines.map do |line|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?
    question, answer = stripped.split('|', 2).map { |entry| entry.to_s.strip }
    next if question.to_s.empty? || answer.to_s.empty?

    { 'question' => question, 'answer' => answer }
  end.compact
end

def parse_body_sections_lines(lines)
  lines.map do |line|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?
    title, body = stripped.split('|', 2).map { |entry| entry.to_s.strip }
    next if title.to_s.empty?

    { 'title' => title, 'body' => body.to_s }
  end.compact
end

def parse_story_media_lines(lines)
  lines.map do |line|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?

    kind, url, caption, image_alt = stripped.split('|', 4).map { |entry| entry.to_s.strip }
    normalized_kind = kind.to_s.downcase
    normalized_kind = 'video' if normalized_kind.include?('video')
    normalized_kind = 'image' unless %w[image video].include?(normalized_kind)
    next if url.to_s.empty?

    {
      'image_url' => normalized_kind == 'image' ? url : nil,
      'video_url' => normalized_kind == 'video' ? url : nil,
      'caption' => caption,
      'image_alt' => image_alt
    }.reject { |_key, value| value.to_s.strip.empty? }
  end.compact
end

def parse_step_media_lines(lines)
  lines.each_with_object({}) do |line, media_map|
    stripped = line.sub(/\A[-*]\s*/, '').strip
    next if stripped.empty?

    step_ref, kind, url, caption, image_alt = stripped.split('|', 5).map { |entry| entry.to_s.strip }
    step_index = step_ref.to_i
    next if step_index <= 0 || url.to_s.empty?

    normalized_kind = kind.to_s.downcase
    normalized_kind = 'video' if normalized_kind.include?('video')
    normalized_kind = 'image' unless %w[image video].include?(normalized_kind)
    media_map[step_index - 1] ||= []
    media_map[step_index - 1] << {
      'image_url' => normalized_kind == 'image' ? url : nil,
      'video_url' => normalized_kind == 'video' ? url : nil,
      'caption' => caption,
      'image_alt' => image_alt
    }.reject { |_key, value| value.to_s.strip.empty? }
  end
end

def merge_step_media(steps, media_map)
  Array(steps).each_with_index.map do |step, index|
    merged = deep_clone(step || {})
    merged['media'] = Array(media_map[index] || merged['media']).reject(&:empty?)
    merged
  end
end

def parsed_or_json_textarea(simple_value, json_value, parser:, fallback:)
  simple_lines = simple_value.to_s.split(/\r?\n/).map(&:strip).reject(&:empty?)
  return parser.call(simple_lines) unless simple_lines.empty?

  parse_json_field(json_value, fallback)
end

def imported_recipe_payload(template_key:, import_text:, actor_name:)
  template = recipe_template_payload(template_key)
  sections = split_import_sections(import_text)
  title = sections['title'].join(' ').strip
  subtitle = sections['subtitle'].join(' ').strip
  summary = sections['summary'].join(' ').strip
  description = sections['description'].join("\n").strip
  category = sections['category'].join(' ').strip
  difficulty_value = sections['difficulty'].join(' ').strip
  access_value = sections['access'].join(' ').strip

  payload = deep_clone(template)
  payload['title'] = title unless title.empty?
  payload['subtitle'] = subtitle unless subtitle.empty?
  payload['summary'] = summary unless summary.empty?
  payload['description'] = description unless description.empty?
  payload['category'] = category unless category.empty?
  payload['search_terms'] = parse_import_list(sections['seo'] + sections['tags'])
  payload['tags'] = (Array(payload['tags']) + parse_import_list(sections['tags'])).uniq
  payload['collections'] = (Array(payload['collections']) + parse_import_list(sections['collections'])).uniq
  payload['products'] = parse_import_list(sections['products']).map { |handle| { 'handle' => handle } }
  payload['sources'] = parse_source_lines(sections['sources'])
  payload['ingredient_groups'] = parse_import_ingredient_groups(sections['ingredients'])
  payload['steps'] = parse_import_steps(sections['steps'])
  payload['tips'] = parse_import_tips(sections['tips'])
  payload['serves'] = sections['serves'].join(' ')[/\d+/, 0].to_i if sections['serves'].any?
  payload['timing'] = payload.fetch('timing', {}).merge(parse_import_timing(sections['timing']))
  payload['submitted_by'] = { 'name' => actor_name, 'type' => 'internal' }

  unless access_value.empty?
    payload['access'] =
      if access_value.downcase.include?('member') || access_value.downcase.include?('client') || access_value.downcase.include?('premium')
        'member'
      else
        'free'
      end
  end

  unless difficulty_value.empty?
    normalized = difficulty_value.downcase
    payload['difficulty'] = {
      'value' => normalized.include?('inter') ? 'intermediaire' : normalized.include?('sign') ? 'signature' : 'facile',
      'label' => difficulty_value
    }
  end

  seo = payload['seo'] ||= {}
  seo['keywords'] = (Array(seo['keywords']) + parse_import_list(sections['seo'])).uniq
  seo['faq'] = parse_import_faq(sections['faq']) if sections['faq'].any?
  seo['body_sections'] = [
    { 'title' => 'Pourquoi cette recette fonctionne', 'body' => summary },
    { 'title' => 'Erreurs a eviter', 'body' => '' },
    { 'title' => 'Conservation et service', 'body' => '' }
  ] if Array(seo['body_sections']).empty? && !summary.empty?

  payload = smart_recipe_defaults(payload)
  payload['page_url'] = ''

  if payload['product'].to_h.empty? && payload['products'].is_a?(Array) && payload['products'].first
    first_handle = payload['products'].first['handle']
    payload['product'] = {
      'handle' => first_handle,
      'collection_handle' => '',
      'required_handles' => payload['products'].map { |entry| entry['handle'] }.compact,
      'primary_label' => 'Voir le produit',
      'secondary_label' => 'Voir la selection',
      'note' => 'Produits importes depuis le brief recette.'
    }
  end

  payload
end

def admin_recipe_payload(request)
  query = request.query
  steps = parsed_or_json_textarea(query['steps_text'], query['steps_json'], parser: method(:parse_steps_lines), fallback: [])
  step_media_map = parsed_or_json_textarea(query['step_media_text'], query['step_media_json'], parser: method(:parse_step_media_lines), fallback: {})
  payload = {
    'slug' => query['slug'],
    'title' => query['title'],
    'status' => query['status'],
    'access' => query['access'],
    'page_url' => query['page_url'],
    'eyebrow' => query['eyebrow'],
    'subtitle' => query['subtitle'],
    'summary' => query['summary'],
    'description' => query['description'],
    'category' => query['category'],
    'serves' => query['serves'].to_s.strip.empty? ? nil : query['serves'].to_i,
    'difficulty' => {
      'value' => query['difficulty_value'],
      'label' => query['difficulty_label']
    },
    'timing' => {
      'prep' => query['timing_prep'],
      'cook' => query['timing_cook'],
      'rest' => query['timing_rest'],
      'total' => query['timing_total']
    },
    'hero' => {
      'video_url' => query['hero_video_url'],
      'image_url' => query['hero_image_url'],
      'ambient_label' => query['hero_ambient_label']
    },
    'submitted_by' => {
      'name' => query['submitted_by_name'],
      'type' => query['submitted_by_type']
    },
    'search_terms' => csv_terms(query['search_terms']),
    'tags' => csv_terms(query['tags']),
    'collections' => csv_terms(query['collections']),
    'ingredient_groups' => parsed_or_json_textarea(query['ingredient_groups_text'], query['ingredient_groups_json'], parser: method(:parse_import_ingredient_groups), fallback: []),
    'steps' => merge_step_media(steps, step_media_map),
    'tips' => parsed_or_json_textarea(query['tips_text'], query['tips_json'], parser: method(:parse_import_tips), fallback: []),
    'story_media' => parsed_or_json_textarea(query['story_media_text'], query['story_media_json'], parser: method(:parse_story_media_lines), fallback: []),
    'product' => begin
      primary_handle = query['primary_product_handle'].to_s.strip
      collection_handle = query['product_collection_handle'].to_s.strip
      note = query['product_note'].to_s.strip
      if primary_handle.empty? && collection_handle.empty? && note.empty?
        parse_json_field(query['product_json'], {})
      else
        {
          'handle' => primary_handle,
          'collection_handle' => collection_handle,
          'required_handles' => csv_terms(query['product_handles']),
          'primary_label' => 'Voir le produit',
          'secondary_label' => 'Voir la selection',
          'note' => note
        }.reject { |_key, value| value.respond_to?(:empty?) ? value.empty? : value.nil? }
      end
    end,
    'products' => (
      handles = csv_terms(query['product_handles']).map { |handle| { 'handle' => handle } }
      handles.empty? ? parse_json_field(query['products_json'], []) : handles
    ),
    'sources' => parsed_or_json_textarea(query['sources_text'], query['sources_json'], parser: method(:parse_source_lines), fallback: []),
    'seo' => {
      'title' => query['seo_title'],
      'description' => query['seo_description'],
      'keywords' => csv_terms(query['seo_keywords']),
      'body_sections' => parsed_or_json_textarea(query['seo_body_sections_text'], query['seo_body_sections_json'], parser: method(:parse_body_sections_lines), fallback: []),
      'faq' => parsed_or_json_textarea(query['seo_faq_text'], query['seo_faq_json'], parser: method(:parse_faq_lines), fallback: [])
    }
  }.reject { |_key, value| value.nil? }

  smart_recipe_defaults(payload)
end

def admin_dashboard(actor:, recipes:, selected_recipe:, filters:, flash:)
  summary = STORE.dashboard_summary
  actor_summary = ACTORS.summary
  pending = STORE.pending_submissions
  approved = STORE.by_status('approved')
  publications = STORE.publication_history(10)
  audit_log = STORE.audit_log(12)
  actors = ACTORS.all
  recipe = selected_recipe || {}
  search_terms = Array(recipe['search_terms']).join(', ')
  ingredient_groups_json = pretty_json(recipe['ingredient_groups'] || [])
  steps_json = pretty_json(recipe['steps'] || [])
  tips_json = pretty_json(recipe['tips'] || [])
  story_media_json = pretty_json(recipe['story_media'] || [])
  step_media_json = pretty_json(Array(recipe['steps']).map { |step| step['media'] || [] })
  product_json = pretty_json(recipe['product'] || {})
  products_json = pretty_json(recipe['products'] || [])
  sources_json = pretty_json(recipe['sources'] || [])
  primary_product = primary_product_handle(recipe)
  product_collection_handle = recipe.dig('product', 'collection_handle').to_s
  product_note = recipe.dig('product', 'note').to_s
  tags = Array(recipe['tags']).join(', ')
  collections = Array(recipe['collections']).join(', ')
  seo_keywords = Array(recipe.dig('seo', 'keywords')).join(', ')
  seo_body_sections_json = pretty_json(recipe.dig('seo', 'body_sections') || [])
  seo_faq_json = pretty_json(recipe.dig('seo', 'faq') || [])
  ingredient_groups_text = ingredient_groups_for_form(recipe['ingredient_groups'] || [])
  steps_text = steps_for_form(recipe['steps'] || [])
  tips_text = tips_for_form(recipe['tips'] || [])
  story_media_text = story_media_for_form(recipe['story_media'] || [])
  step_media_text = step_media_for_form(recipe['steps'] || [])
  faq_text = faq_for_form(recipe.dig('seo', 'faq') || [])
  body_sections_text = body_sections_for_form(recipe.dig('seo', 'body_sections') || [])
  product_handles_text = product_handles_for_form(recipe['products'] || [])
  sources_text = source_lines_for_form(recipe['sources'] || [])
  history_count = recipe.fetch('revisions', []).length
  shopify_page = recipe['shopify_page'] || {}
  shopify_errors = SHOPIFY_PUBLISHER.configuration_errors
  shopify_ready = shopify_errors.empty?
  customer_shelf_ready = SHOPIFY_CUSTOMER_SHELF.configuration_errors.empty?
  editorial_checks = [
    ['Identite', recipe['title'].to_s.strip != '' && recipe['slug'].to_s.strip != ''],
    ['Hero', recipe.dig('hero', 'video_url').to_s.strip != '' || recipe.dig('hero', 'image_url').to_s.strip != ''],
    ['Produits', Array(recipe['products']).any? || primary_product.to_s.strip != ''],
    ['Source', Array(recipe['sources']).any?],
    ['SEO', recipe.dig('seo', 'title').to_s.strip != '' && recipe.dig('seo', 'description').to_s.strip != ''],
    ['Publication', recipe['page_url'].to_s.strip != '' || shopify_page['page_url'].to_s.strip != '']
  ]
  editorial_score = editorial_checks.count { |entry| entry[1] }
  preview_metadata = PREVIEW_MANAGER.metadata
  preview_target = preview_metadata[:preview_target] || {}
  preview_ready = preview_target[:ok]
  template_options = RECIPE_TEMPLATES.map do |key, template|
    "<option value=\"#{html_escape(key)}\">#{html_escape(template['label'])}</option>"
  end.join
  quick_start_title = recipe['slug'] ? '' : (recipe['title'] || '')

  <<~HTML
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Recipes Service Admin</title>
        <style>
          :root {
            color-scheme: light;
            --bg: #f5f1ec;
            --panel: rgba(255,255,255,0.78);
            --line: rgba(16,16,16,0.1);
            --text: #161616;
            --muted: rgba(22,22,22,0.62);
            --accent: #6a8663;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: ui-sans-serif, system-ui, sans-serif;
            background:
              radial-gradient(circle at top left, rgba(255,255,255,0.7), transparent 24%),
              linear-gradient(180deg, #f7f4ef, #efe7dc);
            color: var(--text);
          }
          .page {
            max-width: 1240px;
            margin: 0 auto;
            padding: 32px 20px 80px;
          }
          .hero,
          .panel {
            border: 1px solid var(--line);
            border-radius: 24px;
            background: var(--panel);
            backdrop-filter: blur(16px);
            box-shadow: 0 24px 60px rgba(0,0,0,0.08);
          }
          .hero {
            padding: 28px;
            margin-bottom: 20px;
          }
          .hero h1,
          .panel h2,
          .card h3 {
            margin: 0;
          }
          .hero p,
          .card p,
          .muted,
          td {
            color: var(--muted);
            line-height: 1.6;
          }
          .summary {
            display: grid;
            grid-template-columns: repeat(6, minmax(0,1fr));
            gap: 12px;
            margin-top: 20px;
          }
          .stat,
          .card {
            padding: 16px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: rgba(255,255,255,0.6);
          }
          .stat strong {
            display: block;
            margin-top: 8px;
            font-size: 28px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 20px;
          }
          .panel { padding: 22px; }
          .stack { display: grid; gap: 14px; }
          .toolbar,
          .quickstart,
          .import-grid,
          .filters,
          .editor-grid {
            display: grid;
            gap: 12px;
          }
          .toolbar { grid-template-columns: repeat(4, minmax(0,1fr)); }
          .quickstart { grid-template-columns: 1.15fr 1.15fr 0.7fr 0.7fr; }
          .import-grid { grid-template-columns: 1.1fr 0.9fr; }
          .filters { grid-template-columns: repeat(5, minmax(0,1fr)); }
          .editor-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .editor-grid .full { grid-column: 1 / -1; }
          .editor-grid .section-title {
            grid-column: 1 / -1;
            margin-top: 4px;
            padding-top: 6px;
            border-top: 1px solid var(--line);
            color: var(--text);
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }
          .editor-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 16px;
          }
          .assistant-grid {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 14px;
            margin: 14px 0 18px;
          }
          .checklist {
            display: grid;
            grid-template-columns: repeat(3, minmax(0,1fr));
            gap: 10px;
          }
          .check {
            padding: 14px;
            border: 1px solid var(--line);
            border-radius: 16px;
            background: rgba(255,255,255,0.64);
          }
          .check strong {
            display: block;
            margin-top: 8px;
          }
          .check.is-ok {
            border-color: rgba(106,134,99,0.28);
            background: rgba(106,134,99,0.1);
          }
          details.advanced {
            margin-top: 18px;
            padding: 14px 16px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: rgba(255,255,255,0.58);
          }
          details.advanced summary {
            cursor: pointer;
            font-weight: 600;
          }
          label {
            display: grid;
            gap: 8px;
            font-size: 13px;
            color: var(--muted);
          }
          input, select, textarea, button {
            width: 100%;
            border-radius: 14px;
            border: 1px solid var(--line);
            background: rgba(255,255,255,0.92);
            color: var(--text);
            padding: 12px 14px;
            font: inherit;
          }
          textarea { min-height: 140px; resize: vertical; }
          button {
            width: auto;
            cursor: pointer;
            background: #161616;
            color: #fff;
          }
          .button-light {
            background: rgba(255,255,255,0.9);
            color: var(--text);
          }
          .button-accent {
            background: var(--accent);
            color: #fff;
          }
          .flash {
            padding: 14px 16px;
            border-radius: 18px;
            border: 1px solid var(--line);
            margin-bottom: 16px;
            background: rgba(106,134,99,0.14);
          }
          .flash.error {
            background: rgba(128, 35, 35, 0.1);
          }
          .recipe-list {
            display: grid;
            gap: 12px;
            max-height: 720px;
            overflow: auto;
          }
          .recipe-list article {
            padding: 16px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: rgba(255,255,255,0.64);
          }
          .recipe-list a {
            color: inherit;
            text-decoration: none;
          }
          .pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 4px 10px;
            border-radius: 999px;
            background: rgba(0,0,0,0.06);
            font-size: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            padding: 12px 8px;
            border-top: 1px solid var(--line);
            text-align: left;
            vertical-align: top;
          }
          th {
            color: var(--text);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
          }
          code {
            padding: 2px 6px;
            border-radius: 999px;
            background: rgba(0,0,0,0.06);
          }
          .mini-grid {
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(2, minmax(0,1fr));
          }
          .toolbar-card {
            display: grid;
            gap: 12px;
            align-content: start;
          }
          .helper {
            font-size: 12px;
            color: var(--muted);
            line-height: 1.5;
          }
          @media (max-width: 960px) {
            .summary,
            .grid { grid-template-columns: 1fr; }
            .toolbar,
            .quickstart,
            .import-grid,
            .filters,
            .editor-grid,
            .assistant-grid,
            .checklist { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <section class="hero">
            <h1>Recipes Service Admin</h1>
            <p>Base locale de moderation, publication et export pour le registre recette Vanille Desire.</p>
            <p class="muted">Session: #{html_escape(actor['name'])} · role #{html_escape(actor['role'])}</p>
            <div class="summary">
              <div class="stat"><span class="muted">Total</span><strong>#{summary[:total]}</strong></div>
              <div class="stat"><span class="muted">Approuvees</span><strong>#{summary[:approved]}</strong></div>
              <div class="stat"><span class="muted">Pending</span><strong>#{summary[:pending]}</strong></div>
              <div class="stat"><span class="muted">Rejetees</span><strong>#{summary[:rejected]}</strong></div>
              <div class="stat"><span class="muted">Archivees</span><strong>#{summary[:archived]}</strong></div>
              <div class="stat"><span class="muted">Backend</span><strong>#{html_escape(summary[:backend])}</strong></div>
            </div>
          </section>

          #{flash ? "<div class=\"flash #{html_escape(flash['level'])}\">#{html_escape(flash['message'])}</div>" : ''}

          <section class="panel" style="margin-bottom:20px;">
            <h2>Studio Shopify</h2>
            <p class="muted">La cible preview est resolue automatiquement sur la version QA la plus recente pour garder le cockpit aligne avec la bonne release.</p>
            <div class="quickstart" style="grid-template-columns: 1.1fr 1.1fr 0.9fr 0.9fr;">
              <article class="card toolbar-card">
                <strong>Preview cible</strong>
                <p>#{preview_ready ? "#{html_escape(preview_target[:name])} · <code>#{html_escape(preview_target[:id])}</code>" : html_escape(preview_target[:error] || 'Aucune cible preview')}</p>
                <div class="helper">Strategie: prefixe <code>#{html_escape(preview_metadata[:preview_theme_prefix])}</code> · roles #{html_escape(Array(preview_metadata[:preview_role_allowlist]).join(', '))}</div>
              </article>
              <article class="card toolbar-card">
                <strong>Store & configuration</strong>
                <p><code>#{html_escape(preview_metadata[:store_domain])}</code> · API #{html_escape(preview_metadata[:api_version])}</p>
                <div class="helper">Fichier studio: <code>#{html_escape(STUDIO_SETTINGS.path)}</code></div>
              </article>
              <form class="card toolbar-card" method="post" action="/admin">
                <input type="hidden" name="action" value="sync_preview_theme">
                <button class="button-accent" type="submit">Synchroniser la preview cible</button>
                <div class="helper">Push du theme local vers la QA la plus recente via Shopify CLI.</div>
              </form>
              <article class="card toolbar-card">
                <strong>Raccourcis</strong>
                <div class="mini-grid">
                  #{preview_ready ? "<a class=\"button-light\" style=\"display:flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:rgba(255,255,255,0.92);color:var(--text);\" href=\"#{html_escape(preview_target[:preview_url])}\" target=\"_blank\" rel=\"noreferrer\">Ouvrir la preview</a>" : ''}
                  #{preview_ready ? "<a class=\"button-light\" style=\"display:flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:rgba(255,255,255,0.92);color:var(--text);\" href=\"#{html_escape(preview_target[:editor_url])}\" target=\"_blank\" rel=\"noreferrer\">Theme editor</a>" : ''}
                </div>
              </article>
            </div>
          </section>

          <section class="panel" style="margin-bottom:20px;">
            <h2>Console editoriale</h2>
            <p class="muted">Recherche, edition directe, moderation et publication depuis une seule interface locale.</p>
            <form method="get" action="/admin">
              <div class="filters">
                <label>Recherche
                  <input type="text" name="q" value="#{html_escape(filters[:query])}" placeholder="slug, titre, vanille...">
                </label>
                <label>Status
                  <select name="status">
                    <option value="">Tous</option>
                    #{%w[draft pending approved rejected archived].map { |status|
                      selected = filters[:status].to_s == status ? 'selected' : ''
                      "<option value=\"#{status}\" #{selected}>#{status}</option>"
                    }.join}
                  </select>
                </label>
                <label>Access
                  <select name="access">
                    <option value="">Tous</option>
                    #{%w[free member].map { |access|
                      selected = filters[:access].to_s == access ? 'selected' : ''
                      "<option value=\"#{access}\" #{selected}>#{access}</option>"
                    }.join}
                  </select>
                </label>
                <label>Recette
                  <input type="text" name="recipe" value="#{html_escape(filters[:recipe])}" placeholder="slug cible">
                </label>
                <label>&nbsp;
                  <button type="submit">Filtrer</button>
                </label>
              </div>
            </form>
            <div class="toolbar" style="margin-top:16px;">
              <a class="button-light" style="display:flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:rgba(255,255,255,0.92);color:var(--text);" href="#{html_escape(admin_url(query: filters[:query], status: filters[:status], access: filters[:access]))}">Nouvelle recette</a>
              <a class="button-light" style="display:flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:rgba(255,255,255,0.92);color:var(--text);" href="/admin">Recharger</a>
              <form method="post" action="/admin">
                <input type="hidden" name="action" value="export_registry">
                <input type="hidden" name="recipe" value="#{html_escape(filters[:recipe])}">
                <button type="submit">Exporter le registre</button>
              </form>
              <form method="post" action="/admin/logout">
                <button class="button-light" type="submit">Deconnexion</button>
              </form>
              <div class="card"><strong>Selection</strong><p>#{html_escape(recipe['title'] || 'Aucune recette selectionnee')}</p></div>
            </div>
            <div class="quickstart" style="margin-top:16px;">
              <form class="card toolbar-card" method="post" action="/admin">
                <input type="hidden" name="action" value="create_from_template">
                <label>Template
                  <select name="template">
                    #{template_options}
                  </select>
                </label>
                <label>Titre de depart
                  <input type="text" name="title" value="#{html_escape(quick_start_title)}" placeholder="Ex: Creme vanille express">
                </label>
                <button class="button-accent" type="submit">Creer depuis template</button>
              </form>
              <form class="card toolbar-card" method="post" action="/admin">
                <input type="hidden" name="action" value="duplicate_recipe">
                <input type="hidden" name="recipe" value="#{html_escape(recipe['slug'])}">
                <label>Dupliquer la selection
                  <input type="text" name="duplicate_title" value="#{html_escape(recipe['title'] ? "#{recipe['title']} copie" : '')}" placeholder="Nouvelle version ou adaptation">
                </label>
                <div class="helper">Duplique la recette courante en brouillon avec nouveau slug auto.</div>
                <button class="button-light" type="submit" #{recipe['slug'] ? '' : 'disabled'}>Dupliquer</button>
              </form>
              <div class="card toolbar-card">
                <strong>Publication rapide</strong>
                <p class="muted">Enregistrer, exporter et garder le registre public synchro sans quitter l'editeur.</p>
                <div class="helper">Utilisez le bouton Enregistrer + exporter dans le formulaire de droite.</div>
              </div>
              <div class="card toolbar-card">
                <strong>Cadence editoriale</strong>
                <p class="muted">Templates, tags et SEO auto reduisent fortement le temps de publication.</p>
                <div class="helper">Selectionnez une recette pour la moderer, la dupliquer ou la faire evoluer en quelques minutes.</div>
              </div>
            </div>
            <div class="import-grid" style="margin-top:16px;">
              <form class="card toolbar-card" method="post" action="/admin">
                <input type="hidden" name="action" value="import_recipe">
                <label>Importer depuis un brief
                  <select name="template">
                    #{template_options}
                  </select>
                </label>
                <label>Texte recette / Markdown
                  <textarea name="import_text" style="min-height:260px;" placeholder="Titre: Mousse vanille express&#10;Access: free&#10;Category: Desserts&#10;Serves: 4&#10;Timing: prep: 15 min, cook: 0 min, total: 15 min&#10;Tags: mousse, vanille, dessert&#10;Products: vanille-bourbon-madagascar-3-gousses, caviar-vanille-bourbon-madagascar-20g&#10;&#10;Summary: Une mousse rapide et nette pour entrer dans le repertoire.&#10;Description: Une base fouettee courte, tres lisible, avec une vraie finition vanille.&#10;&#10;Ingredients:&#10;- 30 cl creme liquide&#10;- 80 g chocolat blanc&#10;- 1 gousse de vanille Bourbon&#10;&#10;Steps:&#10;1. Chauffer la creme - infuser la vanille dans la creme chaude.&#10;2. Emulsionner - verser sur le chocolat et lisser.&#10;3. Refroidir et monter - laisser prendre puis fouetter legerement.&#10;&#10;Tips:&#10;- Texture: arretez-vous avant une chantilly trop ferme.&#10;- Service: terminez avec un peu de caviar.&#10;&#10;FAQ:&#10;Q: Peut-on la faire la veille ?&#10;A: Oui, elle tient tres bien une nuit au froid."></textarea>
                </label>
                <button class="button-accent" type="submit">Importer en brouillon</button>
              </form>
              <div class="card toolbar-card">
                <strong>Format accepte</strong>
                <div class="helper">
                  Utilisez des lignes simples avec sections: <code>Titre</code>, <code>Summary</code>, <code>Description</code>, <code>Access</code>, <code>Category</code>, <code>Serves</code>, <code>Timing</code>, <code>Tags</code>, <code>Collections</code>, <code>Products</code>, <code>Sources</code>, <code>Ingredients</code>, <code>Steps</code>, <code>Tips</code>, <code>FAQ</code>.
                </div>
                <div class="helper">
                  Le parser fabrique automatiquement le slug, le SEO de base, les groupes d ingredients, les etapes, les credits de source et le lien produit principal quand des handles Shopify sont fournis.
                </div>
                <div class="helper">
                  Les nouvelles recettes importees restent sur le fallback du hub tant qu une page Shopify dediee n est pas creee.
                </div>
              </div>
            </div>
          </section>

          <section class="panel" style="margin-bottom:20px;">
            <h2>Carnet client Shopify</h2>
            <p class="muted">Met a jour les favoris et l historique directement dans le compte client Shopify. Le carnet devient une vraie couche persistance de marque et la page compte peut l afficher sans bricolage front.</p>
            <div class="quickstart" style="grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr; margin-top: 16px;">
              <article class="card toolbar-card">
                <strong>Etat Shopify customer shelf</strong>
                <p>#{customer_shelf_ready ? "Pret · <code>#{html_escape(SHOPIFY_CUSTOMER_SHELF.shop_domain)}</code>" : 'Configuration incomplete'}</p>
                <div class="helper">#{customer_shelf_ready ? 'Namespace: vd · keys recipe_favorites et recipe_history.' : html_escape(SHOPIFY_CUSTOMER_SHELF.configuration_errors.join(' · '))}</div>
              </article>
              <article class="card toolbar-card">
                <strong>Favoris reels</strong>
                <p>Le compte client peut maintenant porter un vrai carnet persistant au niveau Shopify.</p>
              </article>
              <article class="card toolbar-card">
                <strong>Historique de reprise</strong>
                <p>Le compte garde aussi la reprise des recettes pour retrouver un parcours utile.</p>
              </article>
              <article class="card toolbar-card">
                <strong>Lecture cote compte</strong>
                <p>La page <code>/account</code> lit ces metachamps et recompose les cartes recette a partir du registre public.</p>
              </article>
            </div>
            <form method="post" action="/admin" style="margin-top:16px;">
              <input type="hidden" name="action" value="sync_customer_recipe_shelf">
              <div class="editor-grid">
                <label>Email client
                  <input type="email" name="customer_email" value="" placeholder="client@exemple.com">
                </label>
                <div class="card">
                  <strong>Sync ultra simple</strong>
                  <p class="muted">Entrez seulement les slugs voulus. Le studio retrouve le client par email et pousse les metachamps reels dans Shopify.</p>
                </div>
                <label class="full">Favoris persistants
                  <textarea name="customer_favorites_text" placeholder="beignet-banane&#10;riz-lait-tonka-vanille&#10;pancakes-vanille-sucre"></textarea>
                </label>
                <label class="full">Historique persistant
                  <textarea name="customer_history_text" placeholder="pancakes-vanille-sucre&#10;gateau-pomme-vanille-cannelle&#10;creme-brulee-vanille-bourbon"></textarea>
                </label>
              </div>
              <div class="editor-actions">
                <button class="button-accent" type="submit" #{customer_shelf_ready ? '' : 'disabled'}>Synchroniser le carnet client</button>
              </div>
            </form>
          </section>

          <div class="grid">
            <section class="panel">
              <h2>Catalogue filtrable</h2>
              <div class="recipe-list">
                #{recipes.map { |entry|
                  link = admin_url(recipe: entry['slug'], status: filters[:status], access: filters[:access], query: filters[:query])
                  "<article><a href=\"#{html_escape(link)}\"><h3>#{html_escape(entry['title'])}</h3><p><code>#{html_escape(entry['slug'])}</code></p><p><span class=\"pill\">#{html_escape(entry['status'])}</span> <span class=\"pill\">#{html_escape(entry['access'])}</span></p><p>#{html_escape(entry['summary'])}</p></a></article>"
                }.join.presence || '<article><p>Aucune recette pour ce filtre.</p></article>'}
              </div>
            </section>

            <section class="panel">
              <h2>Edition recette</h2>
              <p class="muted">Creation rapide, enrichissement SEO, produits lies et publication sans quitter le poste editorial.</p>
              <div class="assistant-grid">
                <article class="card toolbar-card">
                  <strong>Assistant de publication</strong>
                  <p>#{recipe['slug'] ? "#{editorial_score}/#{editorial_checks.length} points clefs prets pour la publication." : 'Commencez par l identite, les produits et une source claire.'}</p>
                  <div class="helper">Le bloc simple suffit dans la plupart des cas. Le JSON avance ne sert que pour des formats plus rares.</div>
                </article>
                <div class="checklist">
                  #{editorial_checks.map { |label, ok|
                    "<article class=\"check #{ok ? 'is-ok' : ''}\"><span class=\"pill\">#{ok ? 'ok' : 'a faire'}</span><strong>#{html_escape(label)}</strong></article>"
                  }.join}
                </div>
              </div>
              <form method="post" action="/admin">
                <input type="hidden" name="action" value="#{recipe['slug'] ? 'save_recipe' : 'create_recipe'}">
                <div class="editor-grid">
                  <div class="section-title">1. Identite & parcours</div>
                  <label>Slug
                    <input type="text" name="slug" value="#{html_escape(recipe['slug'])}" #{recipe['slug'] ? 'readonly' : ''} data-role="recipe-slug">
                  </label>
                  <label>Titre
                    <input type="text" name="title" value="#{html_escape(recipe['title'])}" data-role="recipe-title">
                  </label>
                  <label>Status
                    <select name="status">
                      #{%w[draft pending approved rejected archived].map { |status|
                        selected = recipe['status'].to_s == status ? 'selected' : ''
                        "<option value=\"#{status}\" #{selected}>#{status}</option>"
                      }.join}
                    </select>
                  </label>
                  <label>Access
                    <select name="access">
                      #{%w[free member].map { |access|
                        selected = recipe['access'].to_s == access ? 'selected' : ''
                        "<option value=\"#{access}\" #{selected}>#{access}</option>"
                      }.join}
                    </select>
                  </label>
                  <label>Eyebrow
                    <input type="text" name="eyebrow" value="#{html_escape(recipe['eyebrow'])}">
                  </label>
                  <label>Category
                    <input type="text" name="category" value="#{html_escape(recipe['category'])}" data-role="recipe-category">
                  </label>
                  <label>Subtitle
                    <textarea name="subtitle">#{html_escape(recipe['subtitle'])}</textarea>
                  </label>
                  <label>Summary
                    <textarea name="summary" data-role="recipe-summary">#{html_escape(recipe['summary'])}</textarea>
                  </label>
                  <label class="full">Description
                    <textarea name="description">#{html_escape(recipe['description'])}</textarea>
                  </label>
                  <label>Search terms
                    <textarea name="search_terms">#{html_escape(search_terms)}</textarea>
                  </label>
                  <label>Tags
                    <textarea name="tags" placeholder="dessert, gousse, petit-dejeuner">#{html_escape(tags)}</textarea>
                  </label>
                  <label>Collections
                    <textarea name="collections" placeholder="recettes-gratuites, desserts-a-la-vanille">#{html_escape(collections)}</textarea>
                  </label>
                  <label>Page URL
                    <input type="text" name="page_url" value="#{html_escape(recipe['page_url'])}" data-role="recipe-page-url">
                  </label>
                  <label>Serves
                    <input type="number" name="serves" value="#{html_escape(recipe['serves'])}">
                  </label>
                  <label>Difficulte value
                    <input type="text" name="difficulty_value" value="#{html_escape(recipe.dig('difficulty', 'value'))}">
                  </label>
                  <label>Difficulte label
                    <input type="text" name="difficulty_label" value="#{html_escape(recipe.dig('difficulty', 'label'))}">
                  </label>
                  <label>Timing prep
                    <input type="text" name="timing_prep" value="#{html_escape(recipe.dig('timing', 'prep'))}">
                  </label>
                  <label>Timing cook
                    <input type="text" name="timing_cook" value="#{html_escape(recipe.dig('timing', 'cook'))}">
                  </label>
                  <label>Timing rest
                    <input type="text" name="timing_rest" value="#{html_escape(recipe.dig('timing', 'rest'))}">
                  </label>
                  <label>Timing total
                    <input type="text" name="timing_total" value="#{html_escape(recipe.dig('timing', 'total'))}">
                  </label>
                  <label>Hero video
                    <input type="text" name="hero_video_url" value="#{html_escape(recipe.dig('hero', 'video_url'))}" placeholder="MP4 libre de droit ou video Shopify via l'editeur theme">
                  </label>
                  <label>Hero image
                    <input type="text" name="hero_image_url" value="#{html_escape(recipe.dig('hero', 'image_url'))}">
                  </label>
                  <label>Hero ambiance
                    <input type="text" name="hero_ambient_label" value="#{html_escape(recipe.dig('hero', 'ambient_label'))}">
                  </label>
                  <label class="full">Galerie recette
                    <textarea name="story_media_text" placeholder="image | https://cdn.shopify.com/.../hero-recette.jpg | Hero recette large | Hero recette&#10;video | https://cdn.shopify.com/.../geste.mp4 | Geste cle de la recette">#{html_escape(story_media_text)}</textarea>
                  </label>
                  <label class="full">Medias par etape
                    <textarea name="step_media_text" placeholder="1 | image | https://cdn.shopify.com/.../step-1.jpg | Mise en place&#10;2 | video | https://cdn.shopify.com/.../step-2.mp4 | Texture a viser">#{html_escape(step_media_text)}</textarea>
                  </label>
                  <div class="full helper">Ces medias alimentent directement la recette depuis le back-office. Les blocs <code>Media recette</code> dans l editeur Shopify peuvent ensuite surcharger hero, galerie et etapes sans casser la base.</div>
                  <div class="section-title">2. SEO & recherche</div>
                  <label>SEO title
                    <input type="text" name="seo_title" value="#{html_escape(recipe.dig('seo', 'title'))}" data-role="seo-title">
                  </label>
                  <label>SEO description
                    <textarea name="seo_description" data-role="seo-description">#{html_escape(recipe.dig('seo', 'description'))}</textarea>
                  </label>
                  <label class="full">SEO keywords
                    <textarea name="seo_keywords" placeholder="beignet banane vanille, vanille madagascar, dessert maison">#{html_escape(seo_keywords)}</textarea>
                  </label>
                  <label>Soumis par
                    <input type="text" name="submitted_by_name" value="#{html_escape(recipe.dig('submitted_by', 'name'))}">
                  </label>
                  <label>Type auteur
                    <input type="text" name="submitted_by_type" value="#{html_escape(recipe.dig('submitted_by', 'type'))}">
                  </label>
                  <div class="section-title">3. Contenu recette</div>
                  <label class="full">Ingredients simplifies
                    <textarea name="ingredient_groups_text" placeholder="Base:&#10;- 3 oeufs&#10;- 120 g sucre&#10;&#10;Finition:&#10;- 1 gousse de vanille">#{html_escape(ingredient_groups_text)}</textarea>
                  </label>
                  <label class="full">Etapes simplifiees
                    <textarea name="steps_text" placeholder="1. Melanger la base | 4 min | Base | Fouetter les oeufs avec le sucre jusqu'a texture lisse.&#10;2. Ajouter la farine | 3 min | Texture | Incorporer sans trop travailler la pate.">#{html_escape(steps_text)}</textarea>
                  </label>
                  <label class="full">Astuces simplifiees
                    <textarea name="tips_text" placeholder="Texture: Arreter des que la creme nappe la spatule.&#10;Service: Finir avec un peu de caviar de vanille.">#{html_escape(tips_text)}</textarea>
                  </label>
                  <label class="full">Produits lies
                    <textarea name="product_handles" placeholder="vanille-bourbon-madagascar-3-gousses&#10;caviar-vanille-bourbon-madagascar-20g">#{html_escape(product_handles_text)}</textarea>
                  </label>
                  <div class="section-title">4. Produits & credits</div>
                  <label>Produit principal
                    <input type="text" name="primary_product_handle" value="#{html_escape(primary_product)}" placeholder="vanille-bourbon-madagascar-3-gousses">
                  </label>
                  <label>Collection catalogue
                    <input type="text" name="product_collection_handle" value="#{html_escape(product_collection_handle)}" placeholder="epices-de-madagascar">
                  </label>
                  <label class="full">Note catalogue
                    <textarea name="product_note" placeholder="Produits recommandes pour faire la recette avec le bon profil vanille.">#{html_escape(product_note)}</textarea>
                  </label>
                  <label class="full">Sections SEO simplifiees
                    <textarea name="seo_body_sections_text" placeholder="Pourquoi cette recette fonctionne | La base reste tres lisible et la vanille tient bien.&#10;Erreurs a eviter | Ne pas surcuire la creme.">#{html_escape(body_sections_text)}</textarea>
                  </label>
                  <label class="full">FAQ simplifiee
                    <textarea name="seo_faq_text" placeholder="Peut-on la preparer la veille ? | Oui, elle se tient tres bien au froid.">#{html_escape(faq_text)}</textarea>
                  </label>
                  <label class="full">Sources & credits
                    <textarea name="sources_text" placeholder="Wikibooks Cookbook:Crème Brûlée I | https://en.wikibooks.org/wiki/Cookbook:Cr%C3%A8me_Br%C3%BBl%C3%A9e_I | CC BY-SA 4.0 | Recette adaptee pour Vanille Desire">#{html_escape(sources_text)}</textarea>
                  </label>
                  <div class="full">
                    <details class="advanced">
                      <summary>Mode avance JSON</summary>
                      <div class="stack" style="margin-top:14px;">
                        <label>Product JSON
                          <textarea name="product_json">#{html_escape(product_json)}</textarea>
                        </label>
                        <label>Products JSON
                          <textarea name="products_json">#{html_escape(products_json)}</textarea>
                        </label>
                        <label>Story media JSON
                          <textarea name="story_media_json">#{html_escape(story_media_json)}</textarea>
                        </label>
                        <label>Step media JSON
                          <textarea name="step_media_json">#{html_escape(step_media_json)}</textarea>
                        </label>
                        <label>Sources JSON
                          <textarea name="sources_json">#{html_escape(sources_json)}</textarea>
                        </label>
                        <label>SEO body sections JSON
                          <textarea name="seo_body_sections_json">#{html_escape(seo_body_sections_json)}</textarea>
                        </label>
                        <label>SEO FAQ JSON
                          <textarea name="seo_faq_json">#{html_escape(seo_faq_json)}</textarea>
                        </label>
                        <label>Ingredients JSON
                          <textarea name="ingredient_groups_json">#{html_escape(ingredient_groups_json)}</textarea>
                        </label>
                        <label>Steps JSON
                          <textarea name="steps_json">#{html_escape(steps_json)}</textarea>
                        </label>
                        <label>Tips JSON
                          <textarea name="tips_json">#{html_escape(tips_json)}</textarea>
                        </label>
                      </div>
                    </details>
                  </div>
                </div>
                <div class="editor-actions">
                  <button type="submit">#{recipe['slug'] ? 'Enregistrer' : 'Creer la recette'}</button>
                  #{recipe['slug'] ? '<button class="button-light" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_and_export\'">Enregistrer + exporter</button>' : '<button class="button-light" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_and_export\'">Creer + exporter</button>'}
                  #{recipe['slug'] ? '<button class="button-accent" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_and_publish_shopify\'">Enregistrer + publier Shopify</button>' : '<button class="button-accent" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_and_publish_shopify\'">Creer + publier Shopify</button>'}
                  #{recipe['slug'] ? '<button class="button-light" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_publish_export\'">Enregistrer + publier + exporter</button>' : '<button class="button-light" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_publish_export\'">Creer + publier + exporter</button>'}
                  #{recipe['slug'] ? "<span class=\"pill\">#{html_escape(recipe['status'])}</span><span class=\"pill\">#{history_count} revisions</span>" : ''}
                </div>
              </form>
              #{recipe['slug'] ? <<~ACTIONS : ''}
                <div class="editor-actions">
                  <form method="post" action="/admin">
                    <input type="hidden" name="action" value="approve_recipe">
                    <input type="hidden" name="slug" value="#{html_escape(recipe['slug'])}">
                    <input type="hidden" name="recipe" value="#{html_escape(recipe['slug'])}">
                    <button type="submit">Approuver</button>
                  </form>
                  <form method="post" action="/admin">
                    <input type="hidden" name="action" value="reject_recipe">
                    <input type="hidden" name="slug" value="#{html_escape(recipe['slug'])}">
                    <input type="hidden" name="recipe" value="#{html_escape(recipe['slug'])}">
                    <button class="button-light" type="submit">Rejeter</button>
                  </form>
                  <form method="post" action="/admin">
                    <input type="hidden" name="action" value="archive_recipe">
                    <input type="hidden" name="slug" value="#{html_escape(recipe['slug'])}">
                    <input type="hidden" name="recipe" value="#{html_escape(recipe['slug'])}">
                    <button class="button-light" type="submit">Archiver</button>
                  </form>
                  <form method="post" action="/admin">
                    <input type="hidden" name="action" value="publish_shopify">
                    <input type="hidden" name="slug" value="#{html_escape(recipe['slug'])}">
                    <input type="hidden" name="recipe" value="#{html_escape(recipe['slug'])}">
                    <button class="button-accent" type="submit">Publier sur Shopify</button>
                  </form>
                </div>
              ACTIONS
            </section>
          </div>

          <div class="grid" style="margin-top:20px;">
            <section class="panel">
              <h2>Soumissions en attente</h2>
              <table>
                <thead>
                  <tr><th>Slug</th><th>Titre</th><th>Source</th><th>Deposee</th></tr>
                </thead>
                <tbody>
                  #{pending.map { |entry|
                    "<tr><td><code>#{html_escape(entry['slug'])}</code></td><td>#{html_escape(entry['title'])}</td><td>#{html_escape(entry.dig('submitted_by', 'name'))}</td><td>#{html_escape(entry['submitted_at'])}</td></tr>"
                  }.join.presence || '<tr><td colspan="4">Aucune soumission en attente.</td></tr>'}
                </tbody>
              </table>
            </section>

            <section class="panel">
              <h2>Recettes publiees</h2>
              <div class="stack">
                #{approved.map { |entry|
                  "<article class=\"card\"><h3>#{html_escape(entry['title'])}</h3><p><code>#{html_escape(entry['slug'])}</code> · #{html_escape(entry['access'])} · #{html_escape(entry['updated_at'])}</p></article>"
                }.join.presence || '<article class="card"><p>Aucune recette publiee.</p></article>'}
              </div>
            </section>
          </div>

          <div class="grid" style="margin-top:20px;">
            <section class="panel">
              <h2>Historique des publications</h2>
              <table>
                <thead>
                  <tr><th>Date</th><th>Acteur</th><th>Compteur</th><th>Sortie</th></tr>
                </thead>
                <tbody>
                  #{publications.map { |entry|
                    "<tr><td>#{html_escape(entry['published_at'])}</td><td>#{html_escape(entry['actor'])}</td><td>#{html_escape(entry['published_count'])}</td><td>#{html_escape(entry['output'])}</td></tr>"
                  }.join.presence || '<tr><td colspan="4">Aucune publication enregistree.</td></tr>'}
                </tbody>
              </table>
            </section>

            <section class="panel">
              <h2>Audit recent</h2>
              <table>
                <thead>
                  <tr><th>Evenement</th><th>Acteur</th><th>Recipe</th><th>Date</th></tr>
                </thead>
                <tbody>
                  #{audit_log.map { |entry|
                    "<tr><td>#{html_escape(entry['event'])}</td><td>#{html_escape(entry['actor'])}</td><td>#{html_escape(entry['slug'])}</td><td>#{html_escape(entry['at'])}</td></tr>"
                  }.join.presence || '<tr><td colspan="4">Aucun log.</td></tr>'}
                </tbody>
              </table>
            </section>
          </div>

          <section class="panel" style="margin-top:20px;">
            <h2>Publication Shopify</h2>
            <div class="stack">
              <article class="card">
                <strong>Etat de la connexion</strong>
                <p>#{shopify_ready ? "Configuree pour #{html_escape(SHOPIFY_PUBLISHER.shop_domain)} (API #{html_escape(SHOPIFY_PUBLISHER.api_version)})" : html_escape(shopify_errors.join(' · '))}</p>
              </article>
              #{recipe['slug'] ? <<~SHOPIFY : '<article class="card"><p>Creez d abord la recette pour publier sa page Shopify dediee.</p></article>'}
                <article class="card">
                  <strong>Derniere page synchronisee</strong>
                  <p>#{shopify_page['page_url'].to_s.empty? ? 'Aucune publication Shopify enregistree pour cette recette.' : "<code>#{html_escape(shopify_page['page_url'])}</code> · #{html_escape(shopify_page['last_action'])} · #{html_escape(shopify_page['last_published_at'])}"}</p>
                </article>
              SHOPIFY
              <article class="card">
                <strong>Preview de relecture active</strong>
                <p>#{preview_ready ? "#{html_escape(preview_target[:name])} · <code>#{html_escape(preview_target[:preview_url])}</code>" : html_escape(preview_target[:error] || 'Preview non resolue')}</p>
              </article>
            </div>
          </section>

          <section class="panel" style="margin-top:20px;">
            <h2>Acteurs autorises</h2>
            <table>
              <thead>
                <tr><th>Nom</th><th>Role</th><th>Organisation</th><th>Etat</th></tr>
              </thead>
              <tbody>
                #{actors.map { |entry|
                  "<tr><td>#{html_escape(entry['name'])}</td><td>#{html_escape(entry['role'])}</td><td>#{html_escape(entry['organization'])}</td><td>#{html_escape(entry['active'] ? 'active' : 'inactive')}</td></tr>"
                }.join.presence || '<tr><td colspan="4">Aucun acteur configure.</td></tr>'}
              </tbody>
            </table>
            <div class="summary" style="margin-top:20px;">
              <div class="stat"><span class="muted">Total acteurs</span><strong>#{actor_summary[:total]}</strong></div>
              <div class="stat"><span class="muted">Actifs</span><strong>#{actor_summary[:active]}</strong></div>
              <div class="stat"><span class="muted">Admins</span><strong>#{actor_summary[:admins]}</strong></div>
              <div class="stat"><span class="muted">Editors</span><strong>#{actor_summary[:editors]}</strong></div>
              <div class="stat"><span class="muted">Partners</span><strong>#{actor_summary[:partners]}</strong></div>
              <div class="stat"><span class="muted">Schema SQL</span><strong>v1</strong></div>
            </div>
          </section>

          <section class="panel" style="margin-top:20px;">
            <h2>API utile</h2>
            <div class="stack">
              <article class="card"><strong>Identity</strong><p><code>GET /me</code> · <code>GET /actors</code></p></article>
              <article class="card"><strong>Dashboard</strong><p><code>GET /dashboard</code></p></article>
              <article class="card"><strong>Studio meta</strong><p><code>GET /studio/meta</code> · <code>GET /theme/preview-target</code></p></article>
              <article class="card"><strong>Recherche / filtres</strong><p><code>GET /recipes?status=pending&amp;q=vanille&amp;access=member</code> · <code>GET /admin/login</code></p></article>
              <article class="card"><strong>Historique d'une recette</strong><p><code>GET /recipes/:slug/history</code></p></article>
              <article class="card"><strong>Publication Shopify</strong><p><code>POST /recipes/:slug/publish-shopify</code> avec header <code>X-VD-Token</code></p></article>
              <article class="card"><strong>Sync preview</strong><p><code>POST /theme/sync-preview</code> avec header <code>X-VD-Token</code></p></article>
              <article class="card"><strong>Export public</strong><p><code>POST /exports/registry</code> avec header <code>X-VD-Token</code> ou <code>Authorization: Bearer ...</code></p></article>
            </div>
          </section>
        </div>
        <script>
          (function() {
            const titleInput = document.querySelector('[data-role="recipe-title"]');
            const slugInput = document.querySelector('[data-role="recipe-slug"]');
            const pageUrlInput = document.querySelector('[data-role="recipe-page-url"]');
            const categoryInput = document.querySelector('[data-role="recipe-category"]');
            const summaryInput = document.querySelector('[data-role="recipe-summary"]');
            const seoTitleInput = document.querySelector('[data-role="seo-title"]');
            const seoDescriptionInput = document.querySelector('[data-role="seo-description"]');

            if (!titleInput || !slugInput) return;

            const slugify = function(value) {
              return String(value || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\\u0300-\\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 90);
            };

            const isReadonlySlug = slugInput.hasAttribute('readonly');

            titleInput.addEventListener('input', function() {
              if (!isReadonlySlug && !slugInput.dataset.touched) {
                const slug = slugify(titleInput.value);
                slugInput.value = slug;
                if (pageUrlInput && !pageUrlInput.dataset.touched) pageUrlInput.value = slug ? '/pages/' + slug : '';
              }

              if (seoTitleInput && !seoTitleInput.dataset.touched && titleInput.value.trim()) {
                seoTitleInput.value = titleInput.value.trim() + ' | Vanille Desire';
              }

              if (seoDescriptionInput && summaryInput && !seoDescriptionInput.dataset.touched && summaryInput.value.trim()) {
                seoDescriptionInput.value = summaryInput.value.trim().slice(0, 156);
              }
            });

            slugInput.addEventListener('input', function() {
              slugInput.dataset.touched = 'true';
              if (pageUrlInput && !pageUrlInput.dataset.touched) {
                pageUrlInput.value = slugInput.value.trim() ? '/pages/' + slugify(slugInput.value) : '';
              }
            });

            if (pageUrlInput) {
              pageUrlInput.addEventListener('input', function() {
                pageUrlInput.dataset.touched = 'true';
              });
            }

            if (seoTitleInput) {
              seoTitleInput.addEventListener('input', function() {
                seoTitleInput.dataset.touched = 'true';
              });
            }

            if (seoDescriptionInput) {
              seoDescriptionInput.addEventListener('input', function() {
                seoDescriptionInput.dataset.touched = 'true';
              });
            }

            if (categoryInput) {
              categoryInput.addEventListener('input', function() {
                if (seoTitleInput && !seoTitleInput.dataset.touched && titleInput.value.trim()) {
                  seoTitleInput.value = titleInput.value.trim() + ' | Vanille Desire';
                }
              });
            }
          })();
        </script>
      </body>
    </html>
  HTML
end

class String
  def presence
    strip.empty? ? nil : self
  end
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: '127.0.0.1',
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

server.mount_proc '/health' do |_request, response|
  preview_target = PREVIEW_MANAGER.preview_target
  json_response(response, 200, {
    ok: true,
    service: 'recipes-service',
    version: 4,
    backend: STORE.respond_to?(:backend) ? STORE.backend : 'json',
    preview_target: preview_target[:ok] ? {
      id: preview_target[:id],
      name: preview_target[:name],
      version: preview_target[:version],
      preview_url: preview_target[:preview_url]
    } : nil
  })
end

server.mount_proc '/studio/meta' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  json_response(response, 200, studio_meta_payload)
end

server.mount_proc '/studio/content' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  if request.path != '/studio/content'
    module_key = request.path.sub(%r{\A/studio/content/?}, '')
    payload = studio_module_payload(module_key)
    if payload['headline'].to_s.empty?
      json_response(response, 404, { error: 'not_found' })
    else
      json_response(response, 200, payload)
    end
    next
  end

  payload = STUDIO_CONTENT.all.keys.each_with_object({}) do |module_key, hash|
    hash[module_key] = studio_module_payload(module_key)
  end

  json_response(response, 200, { modules: payload })
end

server.mount_proc '/theme/preview-target' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  json_response(response, 200, PREVIEW_MANAGER.preview_target)
end

server.mount_proc '/dashboard' do |_request, response|
  json_response(response, 200, STORE.dashboard_summary)
end

server.mount_proc '/me' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = current_actor(request)
  unless actor
    unauthorized!(response)
    next
  end

  json_response(response, 200, {
    actor: public_actor(actor),
    permissions: ACTORS.permissions_for(actor)
  })
end

server.mount_proc '/actors' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = require_permission!(request, response, 'actors:read')
  next unless actor

  json_response(response, 200, {
    actors: ACTORS.all.map { |entry| public_actor(entry) },
    summary: ACTORS.summary
  })
end

server.mount_proc '/admin/login' do |request, response|
  case request.request_method
  when 'GET'
    html_response(response, 200, admin_login_page(flash: request.query['flash']))
  when 'POST'
    actor = ACTORS.authenticate(request.query['token'])
    unless actor && ACTORS.allowed?(actor, 'admin')
      html_response(response, 401, admin_login_page(flash: 'Token invalide ou droits insuffisants.'))
      next
    end

    set_admin_session(response, actor)
    html_redirect(response, '/admin')
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
end

server.mount_proc '/admin/logout' do |request, response|
  if request.request_method != 'POST'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  clear_admin_session(response)
  html_redirect(response, '/admin/login')
end

server.mount_proc '/admin' do |request, response|
  actor = current_admin_session_actor(request)
  unless actor && ACTORS.allowed?(actor, 'admin')
    html_redirect(response, '/admin/login')
    next
  end

  filters = admin_filters(request)

  if request.request_method == 'POST'
    action = request.query['action']
    selected_slug = request.query['recipe'] || request.query['slug']
    reviewer = actor_name(request, actor)

    case action
    when 'create_recipe'
      payload = admin_recipe_payload(request)
      created = STORE.create_recipe(payload, actor: reviewer)
      selected_slug = created['slug']
      flash = admin_flash('success', "Recette creee: #{created['title']}")
    when 'create_from_template'
      payload = recipe_template_payload(request.query['template'])
      payload['title'] = request.query['title'].to_s.strip unless request.query['title'].to_s.strip.empty?
      payload = smart_recipe_defaults(payload)
      payload['page_url'] = ''
      created = STORE.create_recipe(payload, actor: reviewer)
      selected_slug = created['slug']
      flash = admin_flash('success', "Template deploye: #{created['title']}")
    when 'import_recipe'
      payload = imported_recipe_payload(
        template_key: request.query['template'],
        import_text: request.query['import_text'],
        actor_name: reviewer
      )
      created = STORE.create_recipe(payload, actor: reviewer)
      selected_slug = created['slug']
      flash = admin_flash('success', "Recette importee: #{created['title']}")
    when 'duplicate_recipe'
      source_slug = [request.query['recipe'], request.query['slug']].map { |value| value.to_s.strip }.find { |value| !value.empty? }
      source = STORE.find(source_slug)
      source ||= STORE.all.find { |entry| entry['slug'] == source_slug }
      raise KeyError, 'recipe not found' unless source

      payload = duplicate_recipe_payload(source)
      duplicate_title = request.query['duplicate_title'].to_s.strip
      payload['title'] = duplicate_title unless duplicate_title.empty?
      base_slug = slugify(payload['title'].to_s.strip.empty? ? payload['slug'] : payload['title'])
      candidate = base_slug
      suffix = 2
      while STORE.find(candidate)
        candidate = "#{base_slug}-#{suffix}"
        suffix += 1
      end
      payload['slug'] = candidate
      payload['page_url'] = "/pages/#{candidate}"
      payload = smart_recipe_defaults(payload)
      created = STORE.create_recipe(payload, actor: reviewer)
      selected_slug = created['slug']
      flash = admin_flash('success', "Recette dupliquee: #{created['title']}")
    when 'save_recipe'
      payload = admin_recipe_payload(request)
      updated = STORE.update_recipe(request.query['slug'], payload, actor: reviewer)
      selected_slug = updated['slug']
      flash = admin_flash('success', "Recette mise a jour: #{updated['title']}")
    when 'save_and_export'
      if request.query['slug'].to_s.strip.empty?
        payload = admin_recipe_payload(request)
        record = STORE.create_recipe(payload, actor: reviewer)
        selected_slug = record['slug']
      else
        payload = admin_recipe_payload(request)
        record = STORE.update_recipe(request.query['slug'], payload, actor: reviewer)
        selected_slug = record['slug']
      end
      publication = run_export(reviewer)
      flash = admin_flash('success', "#{record['title']} enregistre et registre exporte#{publication[:ok] ? '' : ' avec erreurs'}")
    when 'save_and_publish_shopify'
      if request.query['slug'].to_s.strip.empty?
        payload = admin_recipe_payload(request)
        record = STORE.create_recipe(payload, actor: reviewer)
      else
        payload = admin_recipe_payload(request)
        record = STORE.update_recipe(request.query['slug'], payload, actor: reviewer)
      end
      publication = publish_to_shopify(record, actor: reviewer)
      selected_slug = publication[:recipe]['slug']
      flash = admin_flash('success', "#{publication[:recipe]['title']} publie sur Shopify (#{publication[:shopify][:action]} #{publication[:shopify][:page_url]}).")
    when 'save_publish_export'
      if request.query['slug'].to_s.strip.empty?
        payload = admin_recipe_payload(request)
        record = STORE.create_recipe(payload, actor: reviewer)
      else
        payload = admin_recipe_payload(request)
        record = STORE.update_recipe(request.query['slug'], payload, actor: reviewer)
      end
      publication = publish_to_shopify(record, actor: reviewer, export_registry: true)
      selected_slug = publication[:recipe]['slug']
      flash = admin_flash('success', "#{publication[:recipe]['title']} publie sur Shopify puis exporte vers le registre public.")
    when 'approve_recipe'
      STORE.approve(request.query['slug'], reviewer, note: request.query['moderation_note'])
      selected_slug = request.query['slug']
      flash = admin_flash('success', "Recette approuvee: #{selected_slug}")
    when 'reject_recipe'
      STORE.reject(request.query['slug'], reviewer, note: request.query['moderation_note'])
      selected_slug = request.query['slug']
      flash = admin_flash('success', "Recette rejetee: #{selected_slug}")
    when 'archive_recipe'
      STORE.archive(request.query['slug'], reviewer, note: request.query['moderation_note'])
      selected_slug = request.query['slug']
      flash = admin_flash('success', "Recette archivee: #{selected_slug}")
    when 'publish_shopify'
      recipe = STORE.find(request.query['slug'])
      raise KeyError, 'recipe not found' unless recipe

      publication = publish_to_shopify(recipe, actor: reviewer)
      selected_slug = publication[:recipe]['slug']
      flash = admin_flash('success', "#{publication[:recipe]['title']} publie sur Shopify (#{publication[:shopify][:action]} #{publication[:shopify][:page_url]}).")
    when 'sync_customer_recipe_shelf'
      actor = require_permission!(request, response, 'customers:write')
      next unless actor

      shelf = sync_customer_recipe_shelf(
        email: request.query['customer_email'],
        favorites: csv_terms(request.query['customer_favorites_text']),
        history: csv_terms(request.query['customer_history_text']),
        actor: reviewer
      )
      flash = admin_flash('success', "Carnet Shopify synchronise pour #{shelf.dig(:customer, :email)}.")
    when 'sync_preview_theme'
      sync = PREVIEW_MANAGER.sync_latest_preview(repo_root: REPO_ROOT)
      raise ArgumentError, sync[:error] || sync[:output].to_s unless sync[:ok]

      flash = admin_flash('success', "Preview synchronisee sur #{sync.dig(:target, :name)}.")
    when 'export_registry'
      publication = run_export(reviewer)
      flash = admin_flash('success', publication[:ok] ? 'Registre public exporte.' : 'Export termine avec erreurs.')
    else
      flash = admin_flash('error', 'Action admin inconnue.')
    end

    html_redirect(
      response,
      admin_url(
        recipe: selected_slug,
        status: filters[:status],
        access: filters[:access],
        query: filters[:query],
        flash: flash['message'],
        level: flash['level']
      )
    )
    next
  end

  recipes = STORE.all(
    status: filters[:status],
    access: filters[:access],
    query: filters[:query]
  )
  selected_recipe = filters[:recipe].to_s.strip.empty? ? nil : STORE.find(filters[:recipe])
  flash = filters[:flash].to_s.strip.empty? ? nil : admin_flash(filters[:level] || 'success', filters[:flash])

  html_response(
    response,
    200,
    admin_dashboard(
      actor: actor,
      recipes: recipes,
      selected_recipe: selected_recipe,
      filters: filters,
      flash: flash
    )
  )
rescue ArgumentError, KeyError => e
  html_redirect(
    response,
    admin_url(
      recipe: request.query['recipe'] || request.query['slug'],
      status: filters&.dig(:status),
      access: filters&.dig(:access),
      query: filters&.dig(:query),
      flash: e.message,
      level: 'error'
    )
  )
end

server.mount_proc '/customers' do |request, response|
  if request.request_method != 'POST'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = require_permission!(request, response, 'customers:write')
  next unless actor

  payload = parse_body(request)
  unless (payload['action'] || request.query['action']).to_s == 'recipe_shelf'
    json_response(response, 404, { error: 'not_found' })
    next
  end
  result = sync_customer_recipe_shelf(
    email: payload['email'],
    favorites: payload['favorites'],
    history: payload['history'],
    actor: actor_name(request, actor)
  )
  json_response(response, 200, result)
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

server.mount_proc '/recipes' do |request, response|
  case request.request_method
  when 'GET'
    recipes = STORE.all(
      status: request.query['status'],
      access: request.query['access'],
      query: request.query['q'],
      submitted_by_type: request.query['submitted_by_type']
    )
    json_response(response, 200, { recipes: recipes })
  when 'POST'
    actor = current_actor(request)
    unless actor
      unauthorized!(response)
      next
    end

    payload = parse_body(request)
    reviewer = actor_name(request, actor)

    if ACTORS.allowed?(actor, 'recipes:write')
      json_response(response, 201, STORE.create_recipe(payload, actor: reviewer))
    elsif ACTORS.allowed?(actor, 'recipes:submit')
      payload['submitted_by'] ||= {
        'name' => actor['name'],
        'type' => 'partner',
        'organization' => actor['organization']
      }
      json_response(response, 201, STORE.create_submission(payload, actor: reviewer))
    else
      forbidden!(response, 'recipes:write')
    end
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

server.mount_proc '/submissions' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = require_permission!(request, response, 'submissions:read')
  next unless actor

  json_response(response, 200, { submissions: STORE.pending_submissions })
end

server.mount_proc '/publications' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = require_permission!(request, response, 'publications:read')
  next unless actor

  json_response(response, 200, { publications: STORE.publication_history })
end

server.mount_proc '/audit' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = require_permission!(request, response, 'audit:read')
  next unless actor

  json_response(response, 200, { audit_log: STORE.audit_log })
end

server.mount_proc '/exports/registry' do |request, response|
  if request.request_method != 'POST'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = require_permission!(request, response, 'recipes:export')
  next unless actor

  json_response(response, 200, run_export(actor_name(request, actor)))
end

server.mount_proc '/recipes/' do |request, response|
  if request.path == '/recipes'
    case request.request_method
    when 'GET'
      recipes = STORE.all(
        status: request.query['status'],
        access: request.query['access'],
        query: request.query['q'],
        submitted_by_type: request.query['submitted_by_type']
      )
      json_response(response, 200, { recipes: recipes })
    when 'POST'
      actor = current_actor(request)
      unless actor
        unauthorized!(response)
        next
      end

      payload = parse_body(request)
      reviewer = actor_name(request, actor)

      if ACTORS.allowed?(actor, 'recipes:write')
        json_response(response, 201, STORE.create_recipe(payload, actor: reviewer))
      elsif ACTORS.allowed?(actor, 'recipes:submit')
        payload['submitted_by'] ||= {
          'name' => actor['name'],
          'type' => 'partner',
          'organization' => actor['organization']
        }
        json_response(response, 201, STORE.create_submission(payload, actor: reviewer))
      else
        forbidden!(response, 'recipes:write')
      end
    else
      json_response(response, 405, { error: 'method_not_allowed' })
    end
    next
  end

  slug = request.path.sub(%r{\A/recipes/}, '')

  if request.request_method == 'GET' && request.path.end_with?('/history')
    target_slug = slug.sub(%r{/history\z}, '')
    json_response(response, 200, { revisions: STORE.revision_history(target_slug) })
    next
  end

  if request.request_method == 'GET'
    recipe = STORE.find(slug)
    if recipe
      json_response(response, 200, recipe)
    else
      json_response(response, 404, { error: 'not_found' })
    end
    next
  end

  if request.request_method == 'PATCH' || (request.request_method == 'POST' && request.path.end_with?('/update'))
    actor = require_permission!(request, response, 'recipes:write')
    next unless actor

    payload = parse_body(request)
    target_slug = slug.sub(%r{/update\z}, '')
    json_response(response, 200, STORE.update_recipe(target_slug, payload, actor: actor_name(request, actor)))
  elsif request.request_method == 'POST' && request.path.end_with?('/approve')
    actor = require_permission!(request, response, 'recipes:approve')
    next unless actor

    payload = parse_body(request)
    target_slug = slug.sub(%r{/approve\z}, '')
    json_response(response, 200, STORE.approve(target_slug, actor_name(request, actor), note: payload['note']))
  elsif request.request_method == 'POST' && request.path.end_with?('/reject')
    actor = require_permission!(request, response, 'recipes:reject')
    next unless actor

    payload = parse_body(request)
    target_slug = slug.sub(%r{/reject\z}, '')
    json_response(response, 200, STORE.reject(target_slug, actor_name(request, actor), note: payload['note']))
  elsif request.request_method == 'POST' && request.path.end_with?('/archive')
    actor = require_permission!(request, response, 'recipes:archive')
    next unless actor

    payload = parse_body(request)
    target_slug = slug.sub(%r{/archive\z}, '')
    json_response(response, 200, STORE.archive(target_slug, actor_name(request, actor), note: payload['note']))
  elsif request.request_method == 'POST' && request.path.end_with?('/publish-shopify')
    actor = require_permission!(request, response, 'recipes:publish')
    next unless actor

    payload = parse_body(request)
    target_slug = slug.sub(%r{/publish-shopify\z}, '')
    recipe = STORE.find(target_slug)
    raise KeyError, 'recipe not found' unless recipe

    json_response(
      response,
      200,
      publish_to_shopify(
        recipe,
        actor: actor_name(request, actor),
        export_registry: !!payload['export_registry']
      )
    )
  else
    json_response(response, 405, { error: 'method_not_allowed' })
end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

server.mount_proc '/theme/sync-preview' do |request, response|
  if request.request_method != 'POST'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  actor = require_permission!(request, response, 'themes:sync')
  next unless actor

  json_response(response, 200, PREVIEW_MANAGER.sync_latest_preview(repo_root: REPO_ROOT))
rescue ArgumentError => e
  json_response(response, 422, { error: e.message })
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

server.start
