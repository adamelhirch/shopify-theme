require 'json'
require 'time'

class RecipeStore
  attr_reader :path

  def initialize(path)
    @path = path
  end

  def all
    load_store.fetch('recipes', [])
  end

  def published
    all.select { |recipe| recipe['status'] == 'approved' }
  end

  def find(slug)
    all.find { |recipe| recipe['slug'] == slug }
  end

  def create_submission(payload)
    store = load_store
    recipes = store.fetch('recipes', [])
    slug = payload.fetch('slug')

    raise ArgumentError, 'slug already exists' if recipes.any? { |recipe| recipe['slug'] == slug }

    record = payload.merge(
      'status' => 'pending',
      'submitted_at' => Time.now.utc.iso8601,
      'validated_at' => nil,
      'validated_by' => nil
    )

    recipes << record
    store['recipes'] = recipes
    save_store(store)
    record
  end

  def approve(slug, reviewer)
    update_status(slug, 'approved', reviewer)
  end

  def reject(slug, reviewer)
    update_status(slug, 'rejected', reviewer)
  end

  private

  def update_status(slug, status, reviewer)
    store = load_store
    recipes = store.fetch('recipes', [])
    recipe = recipes.find { |entry| entry['slug'] == slug }

    raise KeyError, 'recipe not found' unless recipe

    recipe['status'] = status
    recipe['validated_at'] = Time.now.utc.iso8601
    recipe['validated_by'] = reviewer
    save_store(store)
    recipe
  end

  def load_store
    JSON.parse(File.read(path))
  end

  def save_store(store)
    File.write(path, JSON.pretty_generate(store) + "\n")
  end
end
