import * as http from 'http'
import _debug from 'debug'
import httpProxy from 'http-proxy'
import { HMR_HEADER } from '../ws'
import { ServerContext } from '..'
import { Connect } from '../../types/connect'
import { HttpProxy } from '../../types/http-proxy'

const debug = _debug('vite:proxy')

export interface ProxyOptions extends HttpProxy.ServerOptions {
  /**
   * rewrite path
   */
  rewrite?: (path: string) => string
  /**
   * configure the proxy server (e.g. listen to events)
   */
  configure?: (proxy: HttpProxy.Server, options: ProxyOptions) => void
  /**
   * webpack-dev-server style bypass function
   */
  bypass?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options: ProxyOptions
  ) => void | null | undefined | false | string
}

export function proxyMiddleware({
  app,
  server,
  config
}: ServerContext): Connect.NextHandleFunction {
  const options = config.server.proxy!

  // lazy require only when proxy is used
  const proxies: Record<string, [HttpProxy.Server, ProxyOptions]> = {}

  Object.keys(options).forEach((context) => {
    let opts = options[context]
    if (typeof opts === 'string') {
      opts = { target: opts } as ProxyOptions
    }
    const proxy = httpProxy.createProxyServer(opts) as HttpProxy.Server
    if (opts.configure) {
      opts.configure(proxy, opts)
    }
    // clone before saving becaues http-proxy mutates the options
    proxies[context] = [proxy, { ...opts }]
  })

  server.on('upgrade', (req, socket, head) => {
    const url = req.url!
    for (const context in proxies) {
      if (url.startsWith(context)) {
        const [proxy, opts] = proxies[context]
        if (
          (opts.ws || opts.target?.toString().startsWith('ws:')) &&
          req.headers['sec-websocket-protocol'] !== HMR_HEADER
        ) {
          proxy.ws(req, socket, head)
        }
      }
    }
  })

  return (req, res, next) => {
    const url = req.url!
    for (const context in proxies) {
      if (url.startsWith(context)) {
        const [proxy, opts] = proxies[context]

        if (opts.bypass) {
          const bypassResult = opts.bypass(req, res, opts)
          if (typeof bypassResult === 'string') {
            req.url = bypassResult
            debug(`bypass: ${req.url} -> ${bypassResult}`)
            return next()
          } else if (bypassResult === false) {
            debug(`bypass: ${req.url} -> 404`)
            return res.end(404)
          }
        }

        debug(`${req.url} -> ${opts.target || opts.forward}`)
        if (opts.rewrite) {
          req.url = opts.rewrite(req.url!)
        }
        proxy.web(req, res)
        return
      }
    }
    next()
  }
}
