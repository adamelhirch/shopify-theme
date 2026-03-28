#!/usr/bin/env ruby
# frozen_string_literal: true

require 'cgi'
require 'json'
require 'openssl'
require 'open3'
require 'uri'
require 'webrick'
require 'English'
require_relative 'lib/actor_registry'
require_relative 'lib/store_factory'

ROOT = File.expand_path(__dir__)
STORE = StoreFactory.build(root: ROOT)
PORT = Integer(ENV.fetch('VD_RECIPES_PORT', '4567'))
ADMIN_TOKEN = ENV.fetch('VD_RECIPES_ADMIN_TOKEN', 'change-me')
ACTORS = ActorRegistry.new(File.join(ROOT, 'data', 'actors.json'), fallback_admin_token: ADMIN_TOKEN)
EXPORT_SCRIPT = File.expand_path('../../bin/export-recipes-store.rb', __dir__)
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

def admin_recipe_payload(request)
  query = request.query
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
    'ingredient_groups' => parse_json_field(query['ingredient_groups_json'], []),
    'steps' => parse_json_field(query['steps_json'], []),
    'tips' => parse_json_field(query['tips_json'], []),
    'product' => parse_json_field(query['product_json'], {}),
    'products' => parse_json_field(query['products_json'], []),
    'seo' => {
      'title' => query['seo_title'],
      'description' => query['seo_description'],
      'keywords' => csv_terms(query['seo_keywords']),
      'body_sections' => parse_json_field(query['seo_body_sections_json'], []),
      'faq' => parse_json_field(query['seo_faq_json'], [])
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
  product_json = pretty_json(recipe['product'] || {})
  products_json = pretty_json(recipe['products'] || [])
  tags = Array(recipe['tags']).join(', ')
  collections = Array(recipe['collections']).join(', ')
  seo_keywords = Array(recipe.dig('seo', 'keywords')).join(', ')
  seo_body_sections_json = pretty_json(recipe.dig('seo', 'body_sections') || [])
  seo_faq_json = pretty_json(recipe.dig('seo', 'faq') || [])
  history_count = recipe.fetch('revisions', []).length
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
          .filters,
          .editor-grid {
            display: grid;
            gap: 12px;
          }
          .toolbar { grid-template-columns: repeat(4, minmax(0,1fr)); }
          .quickstart { grid-template-columns: 1.15fr 1.15fr 0.7fr 0.7fr; }
          .filters { grid-template-columns: repeat(5, minmax(0,1fr)); }
          .editor-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .editor-grid .full { grid-column: 1 / -1; }
          .editor-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 16px;
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
            .filters,
            .editor-grid { grid-template-columns: 1fr; }
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
              <form method="post" action="/admin">
                <input type="hidden" name="action" value="#{recipe['slug'] ? 'save_recipe' : 'create_recipe'}">
                <div class="editor-grid">
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
                    <input type="text" name="hero_video_url" value="#{html_escape(recipe.dig('hero', 'video_url'))}">
                  </label>
                  <label>Hero image
                    <input type="text" name="hero_image_url" value="#{html_escape(recipe.dig('hero', 'image_url'))}">
                  </label>
                  <label>Hero ambiance
                    <input type="text" name="hero_ambient_label" value="#{html_escape(recipe.dig('hero', 'ambient_label'))}">
                  </label>
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
                  <label class="full">Product JSON
                    <textarea name="product_json">#{html_escape(product_json)}</textarea>
                  </label>
                  <label class="full">Products JSON
                    <textarea name="products_json">#{html_escape(products_json)}</textarea>
                  </label>
                  <label class="full">SEO body sections JSON
                    <textarea name="seo_body_sections_json">#{html_escape(seo_body_sections_json)}</textarea>
                  </label>
                  <label class="full">SEO FAQ JSON
                    <textarea name="seo_faq_json">#{html_escape(seo_faq_json)}</textarea>
                  </label>
                  <label class="full">Ingredients JSON
                    <textarea name="ingredient_groups_json">#{html_escape(ingredient_groups_json)}</textarea>
                  </label>
                  <label class="full">Steps JSON
                    <textarea name="steps_json">#{html_escape(steps_json)}</textarea>
                  </label>
                  <label class="full">Tips JSON
                    <textarea name="tips_json">#{html_escape(tips_json)}</textarea>
                  </label>
                </div>
                <div class="editor-actions">
                  <button type="submit">#{recipe['slug'] ? 'Enregistrer' : 'Creer la recette'}</button>
                  #{recipe['slug'] ? '<button class="button-light" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_and_export\'">Enregistrer + exporter</button>' : '<button class="button-light" type="submit" onclick="this.form.querySelector(\'[name=action]\').value=\'save_and_export\'">Creer + exporter</button>'}
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
              <article class="card"><strong>Recherche / filtres</strong><p><code>GET /recipes?status=pending&amp;q=vanille&amp;access=member</code> · <code>GET /admin/login</code></p></article>
              <article class="card"><strong>Historique d'une recette</strong><p><code>GET /recipes/:slug/history</code></p></article>
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
  json_response(response, 200, {
    ok: true,
    service: 'recipes-service',
    version: 3,
    backend: STORE.respond_to?(:backend) ? STORE.backend : 'json'
  })
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
      created = STORE.create_recipe(payload, actor: reviewer)
      selected_slug = created['slug']
      flash = admin_flash('success', "Template deploye: #{created['title']}")
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
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

server.start
