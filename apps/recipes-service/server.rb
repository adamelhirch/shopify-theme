#!/usr/bin/env ruby
# frozen_string_literal: true

require 'cgi'
require 'json'
require 'open3'
require 'webrick'
require 'English'
require_relative 'lib/recipe_store'

ROOT = File.expand_path(__dir__)
STORE = RecipeStore.new(File.join(ROOT, 'data', 'recipes_store.json'))
PORT = Integer(ENV.fetch('VD_RECIPES_PORT', '4567'))
ADMIN_TOKEN = ENV.fetch('VD_RECIPES_ADMIN_TOKEN', 'change-me')
EXPORT_SCRIPT = File.expand_path('../../bin/export-recipes-store.rb', __dir__)

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

def admin_request?(request)
  request['X-VD-Admin-Token'] == ADMIN_TOKEN
end

def reviewer_name(request)
  request['X-VD-Reviewer'] || 'admin'
end

def unauthorized!(response)
  json_response(response, 401, { error: 'unauthorized' })
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

def admin_dashboard
  summary = STORE.dashboard_summary
  pending = STORE.pending_submissions
  approved = STORE.by_status('approved')
  publications = STORE.publication_history(10)
  audit_log = STORE.audit_log(12)

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
          @media (max-width: 960px) {
            .summary,
            .grid { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <section class="hero">
            <h1>Recipes Service Admin</h1>
            <p>Base locale de moderation, publication et export pour le registre recette Vanille Desire.</p>
            <div class="summary">
              <div class="stat"><span class="muted">Total</span><strong>#{summary[:total]}</strong></div>
              <div class="stat"><span class="muted">Approuvees</span><strong>#{summary[:approved]}</strong></div>
              <div class="stat"><span class="muted">Pending</span><strong>#{summary[:pending]}</strong></div>
              <div class="stat"><span class="muted">Rejetees</span><strong>#{summary[:rejected]}</strong></div>
              <div class="stat"><span class="muted">Archivees</span><strong>#{summary[:archived]}</strong></div>
              <div class="stat"><span class="muted">Compte client</span><strong>#{summary[:member]}</strong></div>
            </div>
          </section>

          <div class="grid">
            <section class="panel">
              <h2>Soumissions en attente</h2>
              <table>
                <thead>
                  <tr><th>Slug</th><th>Titre</th><th>Source</th><th>Deposee</th></tr>
                </thead>
                <tbody>
                  #{pending.map { |recipe|
                    "<tr><td><code>#{html_escape(recipe['slug'])}</code></td><td>#{html_escape(recipe['title'])}</td><td>#{html_escape(recipe.dig('submitted_by', 'name'))}</td><td>#{html_escape(recipe['submitted_at'])}</td></tr>"
                  }.join.presence || '<tr><td colspan="4">Aucune soumission en attente.</td></tr>'}
                </tbody>
              </table>
            </section>

            <section class="panel">
              <h2>Recettes publiees</h2>
              <div class="stack">
                #{approved.map { |recipe|
                  "<article class=\"card\"><h3>#{html_escape(recipe['title'])}</h3><p><code>#{html_escape(recipe['slug'])}</code> · #{html_escape(recipe['access'])} · #{html_escape(recipe['updated_at'])}</p></article>"
                }.join}
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
            <h2>API utile</h2>
            <div class="stack">
              <article class="card"><strong>Dashboard</strong><p><code>GET /dashboard</code></p></article>
              <article class="card"><strong>Recherche / filtres</strong><p><code>GET /recipes?status=pending&amp;q=vanille&amp;access=member</code></p></article>
              <article class="card"><strong>Historique d'une recette</strong><p><code>GET /recipes/:slug/history</code></p></article>
              <article class="card"><strong>Export public</strong><p><code>POST /exports/registry</code> avec header <code>X-VD-Admin-Token</code></p></article>
            </div>
          </section>
        </div>
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
  json_response(response, 200, { ok: true, service: 'recipes-service', version: 2 })
end

server.mount_proc '/dashboard' do |_request, response|
  json_response(response, 200, STORE.dashboard_summary)
end

server.mount_proc '/admin' do |_request, response|
  html_response(response, 200, admin_dashboard)
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
    actor = reviewer_name(request)
    payload = parse_body(request)

    if admin_request?(request)
      json_response(response, 201, STORE.create_recipe(payload, actor: actor))
    else
      json_response(response, 201, STORE.create_submission(payload, actor: actor))
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

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  json_response(response, 200, { submissions: STORE.pending_submissions })
end

server.mount_proc '/publications' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  json_response(response, 200, { publications: STORE.publication_history })
end

server.mount_proc '/audit' do |request, response|
  if request.request_method != 'GET'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  json_response(response, 200, { audit_log: STORE.audit_log })
end

server.mount_proc '/exports/registry' do |request, response|
  if request.request_method != 'POST'
    json_response(response, 405, { error: 'method_not_allowed' })
    next
  end

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  json_response(response, 200, run_export(reviewer_name(request)))
end

server.mount_proc '/recipes/' do |request, response|
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

  unless admin_request?(request)
    unauthorized!(response)
    next
  end

  actor = reviewer_name(request)
  payload = parse_body(request)

  if request.request_method == 'PATCH' || (request.request_method == 'POST' && request.path.end_with?('/update'))
    target_slug = slug.sub(%r{/update\z}, '')
    json_response(response, 200, STORE.update_recipe(target_slug, payload, actor: actor))
  elsif request.request_method == 'POST' && request.path.end_with?('/approve')
    target_slug = slug.sub(%r{/approve\z}, '')
    json_response(response, 200, STORE.approve(target_slug, actor, note: payload['note']))
  elsif request.request_method == 'POST' && request.path.end_with?('/reject')
    target_slug = slug.sub(%r{/reject\z}, '')
    json_response(response, 200, STORE.reject(target_slug, actor, note: payload['note']))
  elsif request.request_method == 'POST' && request.path.end_with?('/archive')
    target_slug = slug.sub(%r{/archive\z}, '')
    json_response(response, 200, STORE.archive(target_slug, actor, note: payload['note']))
  else
    json_response(response, 405, { error: 'method_not_allowed' })
  end
rescue ArgumentError, KeyError => e
  json_response(response, 422, { error: e.message })
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

server.start
