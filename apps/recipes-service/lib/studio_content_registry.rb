require 'json'

class StudioContentRegistry
  attr_reader :path

  def initialize(path)
    @path = path
  end

  def data
    @data ||= begin
      JSON.parse(File.read(path))
    rescue Errno::ENOENT, JSON::ParserError
      { 'modules' => {} }
    end
  end

  def all
    data.fetch('modules', {})
  end

  def fetch(key)
    all[key.to_s]
  end
end
