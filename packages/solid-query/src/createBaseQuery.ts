import { QueryObserver } from '@tanstack/query-core'
import type { QueryKey, QueryObserverResult } from '@tanstack/query-core'
import { CreateBaseQueryOptions } from './types'
import { useQueryClient } from './QueryClientProvider'
import {
  onMount,
  onCleanup,
  createComputed,
  createResource,
  createMemo,
  createEffect,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import { useQueryErrorResetBoundary } from './QueryErrorResetBoundary'
import { shouldThrowError } from './utils'

// Base Query Function that is used to create the query.
export function createBaseQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryData,
  TQueryKey extends QueryKey,
>(
  options: CreateBaseQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >,
  Observer: typeof QueryObserver,
): QueryObserverResult<TData, TError> {
  const queryClient = useQueryClient({ context: options.context })
  const errorResetBoundary = useQueryErrorResetBoundary()
  const defaultedOptions = createMemo(() => {
    const computedOptions = queryClient.defaultQueryOptions(options)
    computedOptions._optimisticResults = 'optimistic'
    if (computedOptions.suspense) {
      // Always set stale time when using suspense to prevent
      // fetching again when directly mounting after suspending
      if (typeof computedOptions.staleTime !== 'number') {
        computedOptions.staleTime = 1000
      }
    }

    if (computedOptions.suspense || computedOptions.useErrorBoundary) {
      // Prevent retrying failed query if the error boundary has not been reset yet
      if (!errorResetBoundary.isReset()) {
        computedOptions.retryOnMount = false
      }
    }
    return computedOptions
  })

  const observer = new Observer(queryClient, defaultedOptions())

  const [state, setState] = createStore<QueryObserverResult<TData, TError>>(
    // @ts-ignore
    observer.getOptimisticResult(defaultedOptions()),
  )

  const [dataResource, { refetch }] = createResource<TData | undefined>(() => {
    return new Promise((resolve) => {
      if (state.isSuccess) resolve(state.data)
      if (state.isError && !state.isFetching) {
        throw state.error
      }
    })
  })

  const unsubscribe = observer.subscribe((result) => {
    setState(result)
    refetch()
  })

  onCleanup(() => unsubscribe())

  onMount(() => {
    observer.setOptions(defaultedOptions(), { listeners: false })
  })

  createComputed(() => {
    observer.setOptions(defaultedOptions())
  })

  createEffect(() => {
    if (errorResetBoundary.isReset()) {
      errorResetBoundary.clearReset()
    }
  })

  const handler = {
    get(
      target: QueryObserverResult<TData, TError>,
      prop: keyof QueryObserverResult<TData, TError>,
    ): any {
      if (prop === 'data') {
        // handle suspense
        const isSuspense =
          defaultedOptions().suspense && state.isLoading && state.isFetching

        // handle error boundary
        const isErrorBoundary =
          state.isError &&
          !errorResetBoundary.isReset() &&
          !state.isFetching &&
          shouldThrowError(defaultedOptions().useErrorBoundary, [
            state.error,
            observer.getCurrentQuery(),
          ])

        if (isSuspense || isErrorBoundary) {
          return dataResource()
        }
        return state.data
      }
      return Reflect.get(target, prop)
    },
  }

  const proxyResult = new Proxy(state, handler) as QueryObserverResult<
    TData,
    TError
  >

  return !defaultedOptions().notifyOnChangeProps
    ? observer.trackResult(proxyResult)
    : proxyResult
}
