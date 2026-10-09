export function requireObject<T extends object = Record<string, unknown>>(value: unknown, label = 'service'): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} response. Please try again.`);
  }
  return value as T;
}

export function requireList<T extends object = Record<string, unknown>>(value: unknown, label = 'service', stringFields: string[] = []): T[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object'
    || Array.isArray(item) || stringFields.some(field => typeof item[field] !== 'string'))) {
    throw new Error(`Invalid ${label} response. Please try again.`);
  }
  return value as T[];
}

export function optionalList<T extends object = Record<string, unknown>>(value: unknown, label: string): T[] {
  return value == null ? [] : requireList<T>(value, label);
}

export async function readApiJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Unable to load data (HTTP ${response.status}).`);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid JSON response from the service. Please try again.');
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid service response. Please try again.');
  return data;
}
