import useSWR from 'swr'
import { api } from '../api/client'

export function useApi<T>(path: string | null) {
  return useSWR<T>(path, (key: string) => api.get<T>(key))
}
