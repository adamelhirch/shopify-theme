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
    when 'postgres'
      require_relative 'postgres_recipe_store'
      PostgresRecipeStore.new(
        database_url: ENV.fetch('VD_RECIPES_DATABASE_URL'),
        schema_path: File.join(root, 'schema.sql')
      )
    else
      raise ArgumentError, "unsupported store backend: #{backend}"
    end
  end
end
