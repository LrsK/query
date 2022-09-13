import { screen, waitFor, fireEvent, render } from 'solid-testing-library'
import '@testing-library/jest-dom'
import {
  expectType,
  mockVisibilityState,
  sleep,
  mockNavigatorOnLine,
  mockLogger,
  createQueryClient,
  // @ts-ignore
} from '../../../../tests/utils'
import { Blink, queryKey, setActTimeout } from './utils'
import {
  createQuery,
  CreateQueryResult,
  QueryCache,
  QueryFunction,
  QueryFunctionContext,
  CreateQueryOptions,
  DefinedCreateQueryResult,
  QueryClientProvider,
} from '..'
import {
  JSX,
  Match,
  Switch,
  createRenderEffect,
  createEffect,
  createSignal,
  Show,
} from 'solid-js'

describe('createQuery', () => {
  const queryCache = new QueryCache()
  const queryClient = createQueryClient({ queryCache })

  it('should return the correct types', () => {
    const key = queryKey()

    // @ts-ignore
    // eslint-disable-next-line
    function Page() {
      // unspecified query function should default to unknown
      const noQueryFn = createQuery(key)
      expectType<unknown>(noQueryFn.data)
      expectType<unknown>(noQueryFn.error)

      // it should infer the result type from the query function
      const fromQueryFn = createQuery(key, () => 'test')
      expectType<string | undefined>(fromQueryFn.data)
      expectType<unknown>(fromQueryFn.error)

      // it should be possible to specify the result type
      const withResult = createQuery<string>(key, () => 'test')
      expectType<string | undefined>(withResult.data)
      expectType<unknown | null>(withResult.error)

      // it should be possible to specify the error type
      const withError = createQuery<string, Error>(key, () => 'test')
      expectType<string | undefined>(withError.data)
      expectType<Error | null>(withError.error)

      // it should provide the result type in the configuration
      createQuery(
        key,
        async () => true,
        {
          onSuccess: (data) => expectType<boolean>(data),
          onSettled: (data) => expectType<boolean | undefined>(data),
        },
      )

      // it should be possible to specify a union type as result type
      const unionTypeSync = createQuery(
        key,
        () => (Math.random() > 0.5 ? 'a' : 'b'),
        {
          onSuccess: (data) => expectType<'a' | 'b'>(data),
        },
      )
      expectType<'a' | 'b' | undefined>(unionTypeSync.data)

      const unionTypeAsync = createQuery<'a' | 'b'>(
        key,
        () => Promise.resolve(Math.random() > 0.5 ? 'a' : 'b'),
        {
          onSuccess: (data) => expectType<'a' | 'b'>(data),
        },
      )
      expectType<'a' | 'b' | undefined>(unionTypeAsync.data)

      // should error when the query function result does not match with the specified type
      // @ts-expect-error
      createQuery<number>(key, () => 'test')

      // it should infer the result type from a generic query function
      function queryFn<T = string>(): Promise<T> {
        return Promise.resolve({} as T)
      }

      const fromGenericQueryFn = createQuery(key, () => queryFn())
      expectType<string | undefined>(fromGenericQueryFn.data)
      expectType<unknown>(fromGenericQueryFn.error)

      const fromGenericOptionsQueryFn = createQuery({
        queryKey: key,
        queryFn: () => queryFn(),
      })
      expectType<string | undefined>(fromGenericOptionsQueryFn.data)
      expectType<unknown>(fromGenericOptionsQueryFn.error)

      type MyData = number
      type MyQueryKey = readonly ['my-data', number]

      const getMyDataArrayKey: QueryFunction<MyData, MyQueryKey> = async ({
        queryKey: [, n],
      }) => {
        return n + 42
      }

      createQuery({
        queryKey: () => ['my-data', 100] as const,
        queryFn: getMyDataArrayKey
      })


      const getMyDataStringKey: QueryFunction<MyData, readonly ['1']> = async (
        context,
      ) => {
        expectType<readonly ['1']>(context.queryKey)
        return Number(context.queryKey[0]) + 42
      }

      createQuery({
        queryKey: () => ['1'] as const,
        queryFn: getMyDataStringKey,
      })

      // it should handle query-functions that return Promise<any>
      createQuery(key, () =>
        fetch('return Promise<any>').then((resp) => resp.json()),
      )

      // handles wrapped queries with custom fetcher passed as inline queryFn
      const useWrappedQuery = <
        TQueryKey extends () => [string, Record<string, unknown>?],
        TQueryFnData,
        TError,
        TData = TQueryFnData,
      >(
        qk: TQueryKey,
        fetcher: (
          obj: ReturnType<TQueryKey>[1],
          token: string,
          // return type must be wrapped with TQueryFnReturn
        ) => Promise<TQueryFnData>,
        options?: Omit<
          CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
          'queryKey' | 'queryFn' | 'initialData'
        >,
      ) => createQuery(qk, () => fetcher(qk()[1], 'token'), options)
      const test = useWrappedQuery(() => [''], async () => '1')
      expectType<string | undefined>(test.data)

      // handles wrapped queries with custom fetcher passed directly to createQuery
      const useWrappedFuncStyleQuery = <
        TQueryKey extends () => [string, Record<string, unknown>?],
        TQueryFnData,
        TError,
        TData = TQueryFnData,
      >(
        qk: TQueryKey,
        fetcher: () => Promise<TQueryFnData>,
        options?: Omit<
          CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
          'queryKey' | 'queryFn' | 'initialData'
        >,
      ) => createQuery(qk, fetcher, options)
      const testFuncStyle = useWrappedFuncStyleQuery(() => [''], async () => true)
      expectType<boolean | undefined>(testFuncStyle.data)
    }
  })

  it('should allow to set default data value', async () => {
    const key = queryKey()

    function Page() {
      const state = createQuery(key, async () => {
        await sleep(10)
        return 'test'
      })

      return (
        <div>
          <h1>{state.data ?? 'default'}</h1>
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    screen.getByText('default')

    await waitFor(() => screen.getByText('test'))
  })

  it('should return the correct states for a successful query', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    function Page(): JSX.Element {
      const state = createQuery<string, Error>(key, async () => {
        await sleep(10)
        return 'test'
      })

      createRenderEffect(() => {
        states.push({ ...state })
      })

      if (state.isLoading) {
        expectType<undefined>(state.data)
        expectType<null>(state.error)
      } else if (state.isLoadingError) {
        expectType<undefined>(state.data)
        expectType<Error>(state.error)
      } else {
        expectType<string>(state.data)
        expectType<Error | null>(state.error)
      }

      return (
        <Switch>
          <Match when={state.isLoading}>
            <span>loading</span>
          </Match>
          <Match when={state.isLoadingError}>
            <span>{state.error!.message}</span>
          </Match>
          <Match when={state.data !== undefined}>
            <span>{state.data}</span>
          </Match>
        </Switch>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await waitFor(() => screen.getByText('test'))

    expect(states.length).toEqual(2)

    expect(states[0]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      errorUpdatedAt: 0,
      failureCount: 0,
      errorUpdateCount: 0,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isPaused: false,
      isLoading: true,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'loading',
      fetchStatus: 'fetching',
    })

    expect(states[1]).toEqual({
      data: 'test',
      dataUpdatedAt: expect.any(Number),
      error: null,
      errorUpdatedAt: 0,
      failureCount: 0,
      errorUpdateCount: 0,
      isError: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isPaused: false,
      isLoading: false,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: true,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'success',
      fetchStatus: 'idle',
    })
  })

  it('should return the correct states for an unsuccessful query', async () => {
    const key = queryKey()

    const states: CreateQueryResult<undefined, string>[] = []

    function Page() {
      const state = createQuery<string[], string, undefined>(
        key,
        () => Promise.reject('rejected'),
        {
          retry: 1,
          retryDelay: 1,
        },
      )

      createRenderEffect(() => {
        states.push({ ...state })
      })

      return (
        <div>
          <h1>Status: {state.status}</h1>
          <div>Failure Count: {state.failureCount}</div>
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await waitFor(() => screen.getByText('Status: error'))

    expect(states[0]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      errorUpdatedAt: 0,
      failureCount: 0,
      errorUpdateCount: 0,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isPaused: false,
      isLoading: true,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'loading',
      fetchStatus: 'fetching',
    })

    expect(states[1]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      errorUpdatedAt: 0,
      failureCount: 1,
      errorUpdateCount: 0,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isPaused: false,
      isLoading: true,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'loading',
      fetchStatus: 'fetching',
    })

    expect(states[2]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: 'rejected',
      errorUpdatedAt: expect.any(Number),
      failureCount: 2,
      errorUpdateCount: 1,
      isError: true,
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isPaused: false,
      isLoading: false,
      isLoadingError: true,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'error',
      fetchStatus: 'idle',
    })
  })

  it('should set isFetchedAfterMount to true after a query has been fetched', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    // TODO(lukemurray): do we want reactivity on this key?
    await queryClient.prefetchQuery(key(), () => 'prefetched')

    function Page() {
      const state = createQuery(key, () => 'data')
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)
    expect(states.length).toBe(2)

    expect(states[0]).toMatchObject({
      data: 'prefetched',
      isFetched: true,
      isFetchedAfterMount: false,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isFetched: true,
      isFetchedAfterMount: true,
    })
  })

  it('should call onSuccess after a query has been fetched', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []
    const onSuccess = jest.fn()

    function Page() {
      const state = createQuery(
        key,
        async () => {
          await sleep(10)
          return 'data'
        },
        { onSuccess },
      )
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return <div>data: {state.data}</div>
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await screen.findByText('data: data')
    expect(states.length).toBe(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith('data')
  })

  it('should call onSuccess after a query has been refetched', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []
    const onSuccess = jest.fn()
    let count = 0

    function Page() {
      const state = createQuery(
        key,
        async () => {
          count++
          await sleep(10)
          return 'data' + count
        },
        { onSuccess },
      )

      createRenderEffect(() => {
        states.push({ ...state })
      })

      return (
        <div>
          <div>data: {state.data}</div>
          <button onClick={() => state.refetch()}>refetch</button>
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await screen.findByText('data: data1')
    fireEvent.click(screen.getByRole('button', { name: /refetch/i }))
    await screen.findByText('data: data2')

    expect(states.length).toBe(4) //loading, success, success, success after refetch
    expect(count).toBe(2)
    expect(onSuccess).toHaveBeenCalledTimes(2)
  })

  it('should call onSuccess after a disabled query has been fetched', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []
    const onSuccess = jest.fn()

    function Page() {
      const state = createQuery(key, () => 'data', {
        enabled: false,
        onSuccess,
      })

      createRenderEffect(() => {
        states.push({ ...state })
      })

      createEffect(() => {
        const refetch = state.refetch
        setActTimeout(() => {
          refetch()
        }, 10)
      })

      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(50)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith('data')
  })

  it('should not call onSuccess if a component has unmounted', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []
    const onSuccess = jest.fn()

    function Page() {
      const [show, setShow] = createSignal(true)

      createEffect(() => {
        setShow(false)
      })
      return (
        <Show when={show()}>
          <Component />
        </Show>
      )
    }

    function Component() {
      const state = createQuery(
        key,
        async () => {
          await sleep(10)
          return 'data'
        },
        { onSuccess },
      )
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(50)
    expect(states.length).toBe(1)
    expect(onSuccess).toHaveBeenCalledTimes(0)
  })

  it('should call onError after a query has been fetched with an error', async () => {
    const key = queryKey()
    const states: CreateQueryResult<unknown>[] = []
    const onError = jest.fn()

    function Page() {
      const state = createQuery<unknown>(key, () => Promise.reject('error'), {
        retry: false,
        onError,
      })
      createRenderEffect(() => {
        states.push({ ...state })
      })

      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)
    expect(states.length).toBe(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('error')
  })

  it('should not call onError when receiving a CancelledError', async () => {
    const key = queryKey()
    const onError = jest.fn()

    function Page() {
      const state = createQuery(
        key,
        async () => {
          await sleep(10)
          return 23
        },
        {
          onError,
        },
      )
      return (
        <span>
          status: {state.status}, fetchStatus: {state.fetchStatus}
        </span>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(5)
    await queryClient.cancelQueries(key())
    // query cancellation will reset the query to it's initial state
    await waitFor(() => screen.getByText('status: loading, fetchStatus: idle'))
    expect(onError).not.toHaveBeenCalled()
  })

  it('should call onSettled after a query has been fetched', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []
    const onSettled = jest.fn()

    function Page() {
      const state = createQuery(key, () => 'data', { onSettled })
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)
    expect(states.length).toBe(2)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith('data', null)
  })

  it('should call onSettled after a query has been fetched with an error', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []
    const onSettled = jest.fn()

    function Page() {
      const state = createQuery(key, () => Promise.reject<unknown>('error'), {
        retry: false,
        onSettled,
      })
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)
    expect(states.length).toBe(2)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(undefined, 'error')
  })

  it('should not cancel an ongoing fetch when refetch is called with cancelRefetch=false if we have data already', async () => {
    const key = queryKey()
    let fetchCount = 0

    function Page() {
      const state = createQuery(
        key,
        async () => {
          fetchCount++
          await sleep(10)
          return 'data'
        },
        { enabled: false, initialData: 'initialData' },
      )

      createEffect(() => {
        setActTimeout(() => {
          state.refetch()
        }, 5)
        setActTimeout(() => {
          state.refetch({ cancelRefetch: false })
        }, 5)
      })

      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(20)
    // first refetch only, second refetch is ignored
    expect(fetchCount).toBe(1)
  })

  it('should cancel an ongoing fetch when refetch is called (cancelRefetch=true) if we have data already', async () => {
    const key = queryKey()
    let fetchCount = 0

    function Page() {
      const state = createQuery(
        key,
        async () => {
          fetchCount++
          await sleep(10)
          return 'data'
        },
        { enabled: false, initialData: 'initialData' },
      )

      createEffect(() => {
        setActTimeout(() => {
          state.refetch()
        }, 5)
        setActTimeout(() => {
          state.refetch()
        }, 5)
      })

      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(20)
    // first refetch (gets cancelled) and second refetch
    expect(fetchCount).toBe(2)
  })

  it('should not cancel an ongoing fetch when refetch is called (cancelRefetch=true) if we do not have data yet', async () => {
    const key = queryKey()
    let fetchCount = 0

    function Page() {
      const state = createQuery(
        key,
        async () => {
          fetchCount++
          await sleep(10)
          return 'data'
        },
        { enabled: false },
      )

      createEffect(() => {
        setActTimeout(() => {
          state.refetch()
        }, 5)
        setActTimeout(() => {
          state.refetch()
        }, 5)
      })

      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(20)
    // first refetch will not get cancelled, second one gets skipped
    expect(fetchCount).toBe(1)
  })

  it('should be able to watch a query without providing a query function', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    // TODO(lukemurray): do we want this to be reactive.
    queryClient.setQueryDefaults(key(), { queryFn: () => 'data' })

    function Page() {
      const state = createQuery<string>(key)
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'data' })
  })

  it('should pick up a query when re-mounting with cacheTime 0', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    function Page() {
      const [toggle, setToggle] = createSignal(false)

      return (
        <div>
          <button onClick={() => setToggle(true)}>toggle</button>
          <Switch>
            <Match when={toggle()}>
              <Component value="2" />
            </Match>
            <Match when={!toggle()}>
              <Component value="1" />
            </Match>
          </Switch>
        </div>
      )
    }

    function Component({ value }: { value: string }) {
      const state = createQuery(
        key,
        async () => {
          await sleep(10)
          return 'data: ' + value
        },
        {
          cacheTime: 0,
          notifyOnChangeProps: 'all',
        },
      )
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return (
        <div>
          <div>{state.data}</div>
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await screen.findByText('data: 1')

    fireEvent.click(screen.getByRole('button', { name: /toggle/i }))

    await screen.findByText('data: 2')

    expect(states.length).toBe(4)
    // First load
    expect(states[0]).toMatchObject({
      isLoading: true,
      isSuccess: false,
      isFetching: true,
    })
    // First success
    expect(states[1]).toMatchObject({
      isLoading: false,
      isSuccess: true,
      isFetching: false,
    })
    // Switch, goes to fetching
    expect(states[2]).toMatchObject({
      isLoading: false,
      isSuccess: true,
      isFetching: true,
    })
    // Second success
    expect(states[3]).toMatchObject({
      isLoading: false,
      isSuccess: true,
      isFetching: false,
    })
  })

  // Skipping: should not get into an infinite loop when removing a query with cacheTime 0 and rerendering
  // Not sure how useful this will be since everything should be fine grained reactive

  it('should fetch when refetchOnMount is false and nothing has been fetched yet', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    function Page() {
      const state = createQuery(key, () => 'test', {
        refetchOnMount: false,
      })
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should not fetch when refetchOnMount is false and data has been fetched already', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    queryClient.setQueryData(key(), 'prefetched')

    function Page() {
      const state = createQuery(key, () => 'test', {
        refetchOnMount: false,
      })
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)

    expect(states.length).toBe(1)
    expect(states[0]).toMatchObject({ data: 'prefetched' })
  })

  it('should be able to select a part of the data with select', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    function Page() {
      const state = createQuery(key, () => ({ name: 'test' }), {
        select: (data) => data.name,
      })
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should be able to select a part of the data with select in object syntax', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    function Page() {
      const state = createQuery({
        queryKey: key,
        queryFn: () => ({ name: 'test' }),
        select: (data) => data.name,
      })
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should not re-render when it should only re-render only data change and the selected data did not change', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    function Page() {
      const state = createQuery(key, () => ({ name: 'test' }), {
        select: (data) => data.name,
        notifyOnChangeProps: ['data'],
      })

      createRenderEffect(() => {
        states.push({ ...state })
      })

      createEffect(() => {
        const refetch = state.refetch
        setActTimeout(() => {
          refetch()
        }, 5)
      })

      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should throw an error when a selector throws', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []
    const error = new Error('Select Error')

    function Page() {
      const state = createQuery(key, () => ({ name: 'test' }), {
        select: () => {
          throw error
        },
      })
      createRenderEffect(() => {
        states.push({ ...state })
      })
      return null
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)

    expect(mockLogger.error).toHaveBeenCalledWith(error)
    expect(states.length).toBe(2)

    expect(states[0]).toMatchObject({ status: 'loading', data: undefined })
    expect(states[1]).toMatchObject({ status: 'error', error })
  })

  // it('should not re-run a stable select when it re-renders if selector throws an error', async () => {
  //   const key = queryKey()
  //   const error = new Error('Select Error')
  //   let runs = 0

  //   function Page() {
  //     const [, rerender] = NotReact.useReducer(() => ({}), {})
  //     const state = createQuery<string, Error>(
  //       key,
  //       () => (runs === 0 ? 'test' : 'test2'),
  //       {
  //         select: NotReact.useCallback(() => {
  //           runs++
  //           throw error
  //         }, []),
  //       },
  //     )
  //     return (
  //       <div>
  //         <div>error: {state.error?.message}</div>
  //         <button onClick={rerender}>rerender</button>
  //         <button onClick={() => state.refetch()}>refetch</button>
  //       </div>
  //     )
  //   }

  //   render(() => (
  //     <QueryClientProvider client={queryClient}>
  //       <Page />
  //     </QueryClientProvider>
  //   ))

  //   await waitFor(() => screen.getByText('error: Select Error'))
  //   expect(runs).toEqual(1)
  //   fireEvent.click(screen.getByRole('button', { name: 'rerender' }))
  //   await sleep(10)
  //   expect(runs).toEqual(1)
  //   fireEvent.click(screen.getByRole('button', { name: 'refetch' }))
  //   await sleep(10)
  //   expect(runs).toEqual(2)
  // })

  it('should track properties and only re-render when a tracked property changes', async () => {
    const key = queryKey()
    const states: CreateQueryResult<string>[] = []

    function Page() {
      const state = createQuery(key, async () => {
        await sleep(10)
        return 'test'
      })

      createRenderEffect(() => {
        states.push({ ...state })
      })

      createEffect(() => {
        const data = state.data
        const refetch = state.refetch
        setActTimeout(() => {
          if (data) {
            refetch()
          }
        }, 20)
      })

      return (
        <div>
          <h1>{state.data ?? null}</h1>
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await waitFor(() => screen.getByText('test'))

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should always re-render if we are tracking props but not using any', async () => {
    const key = queryKey()
    let renderCount = 0
    const states: CreateQueryResult<string>[] = []

    function Page() {
      const state = createQuery(key, () => 'test')

      createRenderEffect(() => {
        states.push({ ...state })
      })

      createEffect(() => {
        const _trackState = { ...state }
        renderCount++
      })

      return (
        <div>
          <h1>hello</h1>
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await sleep(10)
    expect(renderCount).toBe(2)
    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  // it('should be able to remove a query', async () => {
  //   const key = queryKey()
  //   const states: CreateQueryResult<number>[] = []
  //   let count = 0

  //   function Page() {
  //     const [, rerender] = NotReact.useState({})
  //     const state = createQuery(key, () => ++count, {
  //       notifyOnChangeProps: 'all',
  //     })

  //     createRenderEffect(() => {
  //       states.push({ ...state })
  //     })

  //     const { remove } = state

  //     return (
  //       <div>
  //         <button onClick={() => remove()}>remove</button>
  //         <button onClick={() => rerender({})}>rerender</button>
  //         data: {state.data ?? 'null'}
  //       </div>
  //     )
  //   }

  //   render(() => (
  //     <QueryClientProvider client={queryClient}>
  //       <Page />
  //     </QueryClientProvider>
  //   ))

  //   await waitFor(() => screen.getByText('data: 1'))
  //   fireEvent.click(screen.getByRole('button', { name: /remove/i }))

  //   await sleep(20)
  //   fireEvent.click(screen.getByRole('button', { name: /rerender/i }))
  //   await waitFor(() => screen.getByText('data: 2'))

  //   expect(states.length).toBe(4)
  //   // Initial
  //   expect(states[0]).toMatchObject({ status: 'loading', data: undefined })
  //   // Fetched
  //   expect(states[1]).toMatchObject({ status: 'success', data: 1 })
  //   // Remove + Hook state update, batched
  //   expect(states[2]).toMatchObject({ status: 'loading', data: undefined })
  //   // Fetched
  //   expect(states[3]).toMatchObject({ status: 'success', data: 2 })
  // })

  it('should create a new query when refetching a removed query', async () => {
    const key = queryKey()
    const states: any[] = []
    let count = 0

    function Page() {
      const state = createQuery(
        key,
        async () => {
          await sleep(10)
          return ++count
        }
      )

      createRenderEffect(() => {
        states.push({ data: state.data, dataUpdatedAt: state.dataUpdatedAt })
      })

      return (
        <div>
          <button onClick={() => state.remove()}>remove</button>
          <button onClick={() => state.refetch()}>refetch</button>
          data: {state.data ?? 'null'}
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await waitFor(() => screen.getByText('data: 1'))
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    await sleep(50)
    fireEvent.click(screen.getByRole('button', { name: /refetch/i }))
    await waitFor(() => screen.getByText('data: 2'))

    expect(states.length).toBe(4)
    // Initial
    expect(states[0]).toMatchObject({ data: undefined, dataUpdatedAt: 0 })
    // Fetched
    expect(states[1]).toMatchObject({ data: 1 })
    // Switch
    expect(states[2]).toMatchObject({ data: undefined, dataUpdatedAt: 0 })
    // Fetched
    expect(states[3]).toMatchObject({ data: 2 })
  })

  it('should share equal data structures between query results', async () => {
    const key = queryKey()

    const result1 = [
      { id: '1', done: false },
      { id: '2', done: false },
    ]

    const result2 = [
      { id: '1', done: false },
      { id: '2', done: true },
    ]

    const states: CreateQueryResult<typeof result1>[] = []

    let count = 0

    function Page() {
      const state = createQuery(
        key,
        async () => {
          await sleep(10)
          count++
          return count === 1 ? result1 : result2
        },
        { notifyOnChangeProps: 'all' },
      )

      createRenderEffect(() => {
        states.push({ ...state })
      })

      const { refetch } = state

      return (
        <div>
          <button onClick={() => refetch()}>refetch</button>
          data: {String(state.data?.[1]?.done)}
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await waitFor(() => screen.getByText('data: false'))
    await sleep(20)
    fireEvent.click(screen.getByRole('button', { name: /refetch/i }))
    await waitFor(() => screen.getByText('data: true'))

    await waitFor(() => expect(states.length).toBe(4))

    const todos = states[2]?.data
    const todo1 = todos?.[0]
    const todo2 = todos?.[1]

    const newTodos = states[3]?.data
    const newTodo1 = newTodos?.[0]
    const newTodo2 = newTodos?.[1]

    expect(todos).toEqual(result1)
    expect(newTodos).toEqual(result2)
    expect(newTodos).not.toBe(todos)
    expect(newTodo1).toBe(todo1)
    expect(newTodo2).not.toBe(todo2)

    return null
  })

  it('should use query function from hook when the existing query does not have a query function', async () => {
    const key = queryKey()
    const results: any[] = []

    queryClient.setQueryData(key(), 'set')

    function Page() {
      const result = createQuery(
        key,
        async () => {
          await sleep(10)
          return 'fetched'
        },
        {
          initialData: 'initial',
          staleTime: Infinity,
        },
      )

      createRenderEffect(() => {
        results.push({ data: result.data, isFetching: result.isFetching })
      })
      
      return (
        <div>
          <div>isFetching: {result.isFetching}</div>
          <button onClick={() => queryClient.refetchQueries(key())}>
            refetch
          </button>
          data: {result.data}
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await waitFor(() => screen.getByText('data: set'))
    fireEvent.click(screen.getByRole('button', { name: /refetch/i }))
    await waitFor(() => screen.getByText('data: fetched'))

    await waitFor(() => expect(results.length).toBe(3))

    expect(results[0]).toMatchObject({ data: 'set', isFetching: false })
    expect(results[1]).toMatchObject({ data: 'set', isFetching: true })
    expect(results[2]).toMatchObject({ data: 'fetched', isFetching: false })
  })

  it('should update query stale state and refetch when invalidated with invalidateQueries', async () => {
    const key = queryKey()
    const states: CreateQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = createQuery(
        key,
        async () => {
          await sleep(10)
          count++
          return count
        },
        { staleTime: Infinity, notifyOnChangeProps: 'all' },
      )

      createRenderEffect(() => {
        console.log('My Log', {
          data: state.data,
          isFetching: state.isFetching,
          isRefetching: state.isRefetching,
          isSuccess: state.isSuccess,
          isStale: state.isStale,
        })
        states.push({ ...state })
      })

      return (
        <div>
          <button onClick={() => queryClient.invalidateQueries(key())}>
            invalidate
          </button>
          data: {state.data}
        </div>
      )
    }

    render(() => (
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    ))

    await waitFor(() => screen.getByText('data: 1'))
    fireEvent.click(screen.getByRole('button', { name: /invalidate/i }))
    await waitFor(() => screen.getByText('data: 2'))

    await waitFor(() => expect(states.length).toBe(4))

    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      isRefetching: false,
      isSuccess: false,
      isStale: true,
    })
    expect(states[1]).toMatchObject({
      data: 1,
      isFetching: false,
      isRefetching: false,
      isSuccess: true,
      isStale: false,
    })
    expect(states[2]).toMatchObject({
      data: 1,
      isFetching: true,
      isRefetching: true,
      isSuccess: true,
      isStale: true,
    })
    expect(states[3]).toMatchObject({
      data: 2,
      isFetching: false,
      isRefetching: false,
      isSuccess: true,
      isStale: false,
    })
  })

})
