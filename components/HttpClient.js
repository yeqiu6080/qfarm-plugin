import http from 'http'
import https from 'https'
import { URL } from 'url'

export default class HttpClient {
    // 发送 HTTP 请求
    static request(options) {
        return new Promise((resolve, reject) => {
            const { url, method = 'GET', headers = {}, data, timeout = 30000 } = options
            
            const parsedUrl = new URL(url)
            const isHttps = parsedUrl.protocol === 'https:'
            const client = isHttps ? https : http
            
            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: method.toUpperCase(),
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                timeout
            }
            
            const req = client.request(requestOptions, (res) => {
                let responseData = ''
                
                res.on('data', (chunk) => {
                    responseData += chunk
                })
                
                res.on('end', () => {
                    try {
                        const statusCode = res.statusCode
                        const responseHeaders = res.headers
                        
                        // 尝试解析 JSON
                        let parsedData
                        try {
                            parsedData = JSON.parse(responseData)
                        } catch {
                            parsedData = responseData
                        }
                        
                        const response = {
                            data: parsedData,
                            status: statusCode,
                            statusText: res.statusMessage,
                            headers: responseHeaders,
                            config: options
                        }
                        
                        // 2xx 状态码视为成功
                        if (statusCode >= 200 && statusCode < 300) {
                            resolve(response)
                        } else {
                            reject(new Error(`HTTP ${statusCode}: ${res.statusMessage}`))
                        }
                    } catch (error) {
                        reject(error)
                    }
                })
            })
            
            req.on('error', (error) => {
                reject(new Error(`请求失败: ${error.message}`))
            })
            
            req.on('timeout', () => {
                req.destroy()
                reject(new Error('请求超时'))
            })
            
            // 发送请求体
            if (data) {
                const body = typeof data === 'string' ? data : JSON.stringify(data)
                req.write(body)
            }
            
            req.end()
        })
    }
    
    // GET 请求
    static async get(url, options = {}) {
        const response = await this.request({
            ...options,
            url,
            method: 'GET'
        })
        return response
    }
    
    // POST 请求
    static async post(url, data, options = {}) {
        const response = await this.request({
            ...options,
            url,
            method: 'POST',
            data
        })
        return response
    }
    
    // PUT 请求
    static async put(url, data, options = {}) {
        const response = await this.request({
            ...options,
            url,
            method: 'PUT',
            data
        })
        return response
    }
    
    // DELETE 请求
    static async delete(url, options = {}) {
        const response = await this.request({
            ...options,
            url,
            method: 'DELETE'
        })
        return response
    }

    // 下载图片并返回 base64
    static async downloadImage(url, options = {}) {
        return new Promise((resolve, reject) => {
            const { timeout = 30000, headers = {} } = options
            
            const parsedUrl = new URL(url)
            const isHttps = parsedUrl.protocol === 'https:'
            const client = isHttps ? https : http
            
            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    ...headers
                },
                timeout
            }
            
            const req = client.request(requestOptions, (res) => {
                // 处理重定向
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    this.downloadImage(res.headers.location, options)
                        .then(resolve)
                        .catch(reject)
                    return
                }
                
                if (res.statusCode !== 200) {
                    reject(new Error(`下载图片失败: HTTP ${res.statusCode}`))
                    return
                }
                
                const chunks = []
                
                res.on('data', (chunk) => {
                    chunks.push(chunk)
                })
                
                res.on('end', () => {
                    try {
                        const buffer = Buffer.concat(chunks)
                        const base64 = buffer.toString('base64')
                        resolve(base64)
                    } catch (error) {
                        reject(new Error(`处理图片数据失败: ${error.message}`))
                    }
                })
            })
            
            req.on('error', (error) => {
                reject(new Error(`下载图片失败: ${error.message}`))
            })
            
            req.on('timeout', () => {
                req.destroy()
                reject(new Error('下载图片超时'))
            })
            
            req.end()
        })
    }
}
