require 'cgi'
require 'json'
require 'net/http'
require 'uri'

class ShopifyPagePublisher
  DEFAULT_API_VERSION = '2025-10'.freeze

  PAGE_LOOKUP_QUERY_BASIC = <<~GRAPHQL.freeze
    query PageByHandle($query: String!) {
      pages(first: 1, query: $query) {
        nodes {
          id
          handle
          title
        }
      }
    }
  GRAPHQL

  PAGE_LOOKUP_QUERY = <<~GRAPHQL.freeze
    query PageByHandle($query: String!) {
      pages(first: 1, query: $query) {
        nodes {
          id
          handle
          title
          recipeSlug: metafield(namespace: "vd", key: "recipe_slug") {
            id
            value
          }
          seoTitle: metafield(namespace: "global", key: "title_tag") {
            id
            value
          }
          seoDescription: metafield(namespace: "global", key: "description_tag") {
            id
            value
          }
        }
      }
    }
  GRAPHQL

  PAGE_CREATE_MUTATION = <<~GRAPHQL.freeze
    mutation PageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  GRAPHQL

  PAGE_UPDATE_MUTATION = <<~GRAPHQL.freeze
    mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  GRAPHQL

  def self.build_from_env
    new(
      shop_domain: ENV['VD_RECIPES_SHOPIFY_STORE'] || ENV['SHOPIFY_STORE'] || '',
      access_token: ENV['VD_RECIPES_SHOPIFY_ADMIN_TOKEN'] || ENV['SHOPIFY_ADMIN_ACCESS_TOKEN'] || '',
      api_version: ENV['VD_RECIPES_SHOPIFY_API_VERSION'] || ENV['SHOPIFY_API_VERSION'] || DEFAULT_API_VERSION
    )
  end

  attr_reader :shop_domain, :api_version

  def initialize(shop_domain:, access_token:, api_version: DEFAULT_API_VERSION)
    @shop_domain = shop_domain.to_s.strip
    @access_token = access_token.to_s.strip
    @api_version = api_version.to_s.strip.empty? ? DEFAULT_API_VERSION : api_version.to_s.strip
    @supports_metafields = true
  end

  def configured?
    configuration_errors.empty?
  end

  def configuration_errors
    errors = []
    errors << 'VD_RECIPES_SHOPIFY_STORE ou SHOPIFY_STORE manquant' if shop_domain.empty?
    errors << 'VD_RECIPES_SHOPIFY_ADMIN_TOKEN ou SHOPIFY_ADMIN_ACCESS_TOKEN manquant' if @access_token.empty?
    errors
  end

  def publish(recipe)
    raise ArgumentError, configuration_errors.join(', ') unless configured?
    raise ArgumentError, 'slug recette manquant' if recipe['slug'].to_s.strip.empty?
    raise ArgumentError, 'titre recette manquant' if recipe['title'].to_s.strip.empty?

    handle = recipe['page_url'].to_s[%r{/pages/([^/?#]+)}, 1].to_s.strip
    handle = recipe['slug'].to_s.strip if handle.empty?
    existing = find_page_by_handle(handle)

    begin
      perform_publish(recipe, handle, existing, include_metafields: @supports_metafields)
    rescue ArgumentError => e
      raise e unless @supports_metafields && metafield_scope_error?(e.message)

      @supports_metafields = false
      existing = find_page_by_handle(handle)
      perform_publish(recipe, handle, existing, include_metafields: false)
    end
  end

  private

  def find_page_by_handle(handle)
    payload =
      begin
        graphql(@supports_metafields ? PAGE_LOOKUP_QUERY : PAGE_LOOKUP_QUERY_BASIC, { query: "handle:#{handle}" })
      rescue ArgumentError => e
        raise e unless @supports_metafields && metafield_scope_error?(e.message)

        @supports_metafields = false
        graphql(PAGE_LOOKUP_QUERY_BASIC, { query: "handle:#{handle}" })
      end

    Array(payload.dig('pages', 'nodes')).first
  end

  def build_page_input(recipe, handle, existing, include_metafields: true)
    seo = recipe['seo'] || {}
    input = {
      title: recipe['title'],
      handle: handle,
      body: build_page_body_html(recipe),
      isPublished: true
    }

    return input unless include_metafields

    metafields = compact_metafields([
      {
        id: existing&.dig('recipeSlug', 'id'),
        namespace: 'vd',
        key: 'recipe_slug',
        type: 'single_line_text_field',
        value: recipe['slug'].to_s
      },
      {
        id: existing&.dig('seoTitle', 'id'),
        namespace: 'global',
        key: 'title_tag',
        type: 'single_line_text_field',
        value: seo['title'].to_s
      },
      {
        id: existing&.dig('seoDescription', 'id'),
        namespace: 'global',
        key: 'description_tag',
        type: 'single_line_text_field',
        value: seo['description'].to_s
      }
    ])
    input[:metafields] = metafields unless metafields.empty?
    input
  end

  def perform_publish(recipe, handle, existing, include_metafields:)
    input = build_page_input(recipe, handle, existing, include_metafields: include_metafields)

    payload =
      if existing
        graphql(PAGE_UPDATE_MUTATION, { id: existing.fetch('id'), page: input }).fetch('pageUpdate')
      else
        graphql(PAGE_CREATE_MUTATION, { page: input }).fetch('pageCreate')
      end

    user_errors = Array(payload['userErrors']).map { |entry| entry['message'] }.reject { |message| message.to_s.empty? }
    raise ArgumentError, user_errors.join(', ') unless user_errors.empty?

    page = payload['page'] || {}
    {
      ok: true,
      action: existing ? 'updated' : 'created',
      page_id: page['id'],
      handle: page['handle'] || handle,
      page_url: "/pages/#{page['handle'] || handle}",
      online_store_url: "https://#{shop_domain}/pages/#{page['handle'] || handle}",
      shop_domain: shop_domain,
      api_version: api_version,
      metafields_published: include_metafields
    }
  end

  def metafield_scope_error?(message)
    text = message.to_s.downcase
    text.include?('metafield') ||
      text.include?('access denied') ||
      text.include?('permission') ||
      text.include?('scope') ||
      text.include?('namespace')
  end

  def compact_metafields(entries)
    entries.each_with_object([]) do |entry, result|
      value = entry[:value].to_s.strip
      next if value.empty?

      result << {
        id: entry[:id],
        namespace: entry[:namespace],
        key: entry[:key],
        type: entry[:type],
        value: value
      }.reject { |_key, candidate| candidate.to_s.strip.empty? }
    end
  end

  def build_page_body_html(recipe)
    sections = []
    sections << "<p>#{paragraphize(recipe['summary'])}</p>" unless recipe['summary'].to_s.strip.empty?
    sections << "<p>#{paragraphize(recipe['description'])}</p>" unless recipe['description'].to_s.strip.empty?

    ingredient_groups = Array(recipe['ingredient_groups'])
    unless ingredient_groups.empty?
      sections << '<h2>Ingrédients</h2>'
      ingredient_groups.each do |group|
        sections << "<h3>#{escape(group['title'])}</h3>" unless group['title'].to_s.strip.empty?
        items = Array(group['items']).map do |item|
          quantity = [item['quantity'], item['unit']].map(&:to_s).reject(&:empty?).join(' ')
          note = item['note'].to_s.strip
          line = [quantity, item['name']].reject { |value| value.to_s.empty? }.join(' ').strip
          line = "#{line} — #{note}" unless note.empty?
          "<li>#{escape(line)}</li>"
        end
        sections << "<ul>#{items.join}</ul>" unless items.empty?
      end
    end

    steps = Array(recipe['steps'])
    unless steps.empty?
      sections << '<h2>Préparation</h2>'
      items = steps.map do |step|
        duration = step['duration'].to_s.strip
        heading = escape(step['title'])
        heading = "#{heading} (#{escape(duration)})" unless duration.empty?
        "<li><strong>#{heading}</strong><br>#{paragraphize(step['body'])}</li>"
      end
      sections << "<ol>#{items.join}</ol>"
    end

    body_sections = Array(recipe.dig('seo', 'body_sections')).each_with_object([]) do |entry, result|
      title = entry['title'].to_s.strip
      body = entry['body'].to_s.strip
      next if title.empty? || body.empty?

      result << "<section><h2>#{escape(title)}</h2><p>#{paragraphize(body)}</p></section>"
    end
    sections.concat(body_sections) unless body_sections.empty?

    tips = Array(recipe['tips']).each_with_object([]) do |tip, result|
      next if tip['body'].to_s.strip.empty?

      title = tip['title'].to_s.strip
      line = title.empty? ? tip['body'].to_s : "#{title} : #{tip['body']}"
      result << "<li>#{escape(line)}</li>"
    end
    sections << "<h2>Astuces</h2><ul>#{tips.join}</ul>" unless tips.empty?

    product_note = recipe.dig('product', 'note').to_s.strip
    unless product_note.empty?
      sections << "<h2>Produits Vanille Désiré conseillés</h2><p>#{paragraphize(product_note)}</p>"
    end

    faqs = Array(recipe.dig('seo', 'faq')).each_with_object([]) do |entry, result|
      question = entry['question'].to_s.strip
      answer = entry['answer'].to_s.strip
      next if question.empty? || answer.empty?

      result << "<dt>#{escape(question)}</dt><dd>#{paragraphize(answer)}</dd>"
    end
    sections << "<h2>FAQ</h2><dl>#{faqs.join}</dl>" unless faqs.empty?

    sources = Array(recipe['sources']).each_with_object([]) do |entry, result|
      title = entry['title'].to_s.strip
      url = entry['url'].to_s.strip
      note = entry['note'].to_s.strip
      next if title.empty? && url.empty?

      label = title.empty? ? url : title
      line = url.empty? ? escape(label) : %(<a href="#{escape(url)}" rel="noreferrer">#{escape(label)}</a>)
      line = "#{line} — #{escape(note)}" unless note.empty?
      result << "<li>#{line}</li>"
    end
    sections << "<h2>Sources</h2><ul>#{sources.join}</ul>" unless sources.empty?

    sections.join
  end

  def paragraphize(value)
    escape(value).gsub(/\r?\n+/, '<br>')
  end

  def escape(value)
    CGI.escapeHTML(value.to_s)
  end

  def graphql(query, variables = {})
    uri = URI("https://#{shop_domain}/admin/api/#{api_version}/graphql.json")
    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    request['X-Shopify-Access-Token'] = @access_token
    request.body = JSON.generate(query: query, variables: variables)

    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true) do |http|
      http.request(request)
    end

    payload = JSON.parse(response.body)
    raise ArgumentError, payload['errors'].map { |entry| entry['message'] }.join(', ') if payload['errors']
    raise ArgumentError, "Shopify API error HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    payload.fetch('data')
  end
end
