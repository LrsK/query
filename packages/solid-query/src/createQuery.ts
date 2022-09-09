import { QueryFunction, QueryObserver } from '@tanstack/query-core'
import { createComputed } from 'solid-js'
import { createStore } from 'solid-js/store'
import { createBaseQuery } from './createBaseQuery'
import {
  CreateQueryOptions,
  CreateQueryResult,
  DefinedCreateQueryResult,
  SolidQueryKey,
} from './types'
import { parseQueryArgs } from './utils'

// HOOK

export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  options: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'initialData'
  > & { initialData?: () => undefined },
): CreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  options: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'initialData'
  > & { initialData: TQueryFnData | (() => TQueryFnData) },
): DefinedCreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  options: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): CreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  queryKey: TQueryKey,
  options?: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'queryKey' | 'initialData'
  > & { initialData?: () => undefined },
): CreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  queryKey: TQueryKey,
  options?: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'queryKey' | 'initialData'
  > & { initialData: TQueryFnData | (() => TQueryFnData) },
): DefinedCreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  queryKey: TQueryKey,
  options?: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'queryKey'
  >,
): CreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  queryKey: TQueryKey,
  // TODO(lukemurray): not sure if we want to use return type here
  queryFn: QueryFunction<TQueryFnData, ReturnType<TQueryKey>>,
  options?: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'queryKey' | 'queryFn' | 'initialData'
  > & { initialData?: () => undefined },
): CreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  queryKey: TQueryKey,
  queryFn: QueryFunction<TQueryFnData, ReturnType<TQueryKey>>,
  options?: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'queryKey' | 'queryFn' | 'initialData'
  > & { initialData: TQueryFnData | (() => TQueryFnData) },
): DefinedCreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  queryKey: TQueryKey,
  queryFn: QueryFunction<TQueryFnData, ReturnType<TQueryKey>>,
  options?: Omit<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'queryKey' | 'queryFn'
  >,
): CreateQueryResult<TData, TError>
export function createQuery<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends SolidQueryKey = SolidQueryKey,
>(
  arg1: TQueryKey | CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  arg2?:
    | QueryFunction<TQueryFnData, ReturnType<TQueryKey>>
    | CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  arg3?: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): CreateQueryResult<TData, TError> {
  // The parseQuery Args functions helps normalize the arguments into the correct form.
  // Whatever the parameters are, they are normalized into the correct form.
  const [parsedOptions, setParsedOptions] = createStore(
    parseQueryArgs(arg1, arg2, arg3),
  )

  // Watch for changes in the options and update the parsed options.
  createComputed(() => {
    const newParsedOptions = parseQueryArgs(arg1, arg2, arg3)
    setParsedOptions(newParsedOptions)
  })

  return createBaseQuery(parsedOptions, QueryObserver)
}
