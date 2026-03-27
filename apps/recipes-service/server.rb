#!/usr/bin/env ruby
# frozen_string_literal: true

require 'cgi'
require 'json'
require 'open3'
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
  bearer || request['X-VD-Token'] || request['X-VD-Admin-Token']
end

def current_actor(request)
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

def admin_dashboard(actor:)
  summary = STORE.dashboard_summary
  actor_summary = ACTORS.summary
  pending = STORE.pending_submissions
  approved = STORE.by_status('approved')
  publications = STORE.publication_history(10)
  audit_log = STORE.audit_log(12)
  actors = ACTORS.all

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
            <p class="muted">Session: #{html_escape(actor['name'])} · role #{html_escape(actor['role'])}</p>
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
              <article class="card"><strong>Recherche / filtres</strong><p><code>GET /recipes?status=pending&amp;q=vanille&amp;access=member</code></p></article>
              <article class="card"><strong>Historique d'une recette</strong><p><code>GET /recipes/:slug/history</code></p></article>
              <article class="card"><strong>Export public</strong><p><code>POST /exports/registry</code> avec header <code>X-VD-Token</code> ou <code>Authorization: Bearer ...</code></p></article>
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
    actor: actor.reject { |key, _value| key == 'token' },
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
    actors: ACTORS.all.map { |entry| entry.reject { |key, _value| key == 'token' } },
    summary: ACTORS.summary
  })
end

server.mount_proc '/admin' do |request, response|
  actor = require_permission!(request, response, 'admin')
  next unless actor

  html_response(response, 200, admin_dashboard(actor: actor))
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
