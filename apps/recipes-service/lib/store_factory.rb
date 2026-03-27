require_relative 'recipe_store'
require_relative 'sql_recipe_store'

module StoreFactory
  module_function

  def build(root:)
    backend = ENV.fetch('VD_RECIPES_STORE', 'json')

    case backend
    when 'json'
      RecipeStore.new(File.join(root, 'data', 'recipes_store.json'))
    when 'sqlite'
      SqlRecipeStore.new(ENV.fetch('VD_RECIPES_SQLITE_PATH', File.join(root, 'data', 'recipes.sqlite3')))
    else
      raise ArgumentError, "unsupported store backend: #{backend}"
    end
  end
end
