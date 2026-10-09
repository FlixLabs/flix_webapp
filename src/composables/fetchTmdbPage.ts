export interface TmdbItem {
  id: number;
  poster_path?: string | null;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
}

export async function fetchTmdbPage(url: string): Promise<{ results: TmdbItem[]; total_pages: number }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load upcoming media (TMDB HTTP ${response.status}).`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid upcoming media response from TMDB. Please try again.');
  }
  if (!data || !Array.isArray(data.results)
    || data.results.some((item: unknown) => !item || typeof item !== 'object'
      || !Number.isInteger((item as TmdbItem).id))
    || (data.total_pages !== undefined
      && (!Number.isInteger(data.total_pages) || data.total_pages < 0))) {
    throw new Error('Invalid upcoming media response from TMDB. Please try again.');
  }
  return { results: data.results, total_pages: data.total_pages || 1 };
}
