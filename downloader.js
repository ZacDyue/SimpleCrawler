let util = require('util');
let urlUtil = require("url");
let events = require('events');
let http = require('http');
let https = require('https');
let iconv = require('iconv-lite');
let BufferHelper = require('bufferhelper');

let unzip;
try {
    unzip = require('zlib').gunzip
} catch (e) { /* unzip not supported */
}

let downloader = function (timeOut) {
    events.EventEmitter.call(this);
    this.download_timeout = timeOut;
};
util.inherits(downloader, events.EventEmitter);

//获取页面编码
downloader.prototype.get_page_encoding = function (header) {
    let page_encoding = undefined;
    if (header['content-type'] != undefined) {
        let contentType = header['content-type'];
        let patt = new RegExp("^.*?charset\=(.+)$", "ig");
        let mts = patt.exec(contentType);
        if (mts != null) {
            page_encoding = mts[1];
        }
    }
    return page_encoding;
};


downloader.prototype.downloadIt = function (urlinfo) {

    var promise = new Promise(function(resolve, reject){

        let self = this;
        let timeOuter = null;
        let pageLink = urlinfo['link'];
        //初始状态没有这个字段 如果发生重定向会添加这这个字段
        if (urlinfo['redirect']) pageLink = urlinfo['redirect'];
        let urlobj;
        try {
            urlobj = urlUtil.parse(pageLink);
        }
        catch (err) {
            //解析网页链接错误 抛出错误
            reject(err);
        }
        let __host = urlobj['hostname'];
        let __port = urlobj['port'];
        let __path = urlobj['path'];
    
        let startTime = new Date();
        let options = {
            'host': __host,
            'port': __port,
            'path': __path,
            'method': 'GET',
            'headers': {
                "User-Agent": 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.104 Safari/537.36 Core/1.53.3538.400 QQBrowser/9.6.12501.400',
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Encoding": "gzip",
                "Accept-Language": "zh-CN,zh;q=0.8,en-US;q=0.6,en;q=0.4",
                "Referer": urlinfo['referer'] || '',
                "host": urlobj['host'],
                "void-proxy": urlinfo['void_proxy'] ? urlinfo['void_proxy'] : "",
                "Cookie": urlinfo['cookie'] ? urlinfo['cookie'] : ""
            }
        };
        console.log('start download by normal downloader ' + __host + ' port:' + __port + ' path:' + __path + ' pagelink:' + pageLink);
    
        let realDownloader = http;
        if (pageLink.startsWith('https')) {
            realDownloader = https;
        }
    
        let req = realDownloader.request(options, function (res) {
            let result = {
                "remote_proxy": res.headers['remoteproxy'],
                "cookie": res.headers['Cookie'],
                "originCode": res.statusCode,
                "content": []
            };
    
            //http redirect;
            let isRedirect = false;
            if (parseInt(res.statusCode) == 301 || parseInt(res.statusCode) == 302 || parseInt(res.statusCode) == 303) {
                if (res.headers['location']) {
                    urlinfo['link'] = urlUtil.resolve(pageLink, res.headers['location']);
                    if (urlinfo['redirectCount']) { //控制重定向次数
                        urlinfo['redirectCount']++;
                    } else {
                        urlinfo['redirectCount'] = 1;
                    }
                    isRedirect = true;
                    console.log(`downloadItRedirect to}|${res.headers['location']}`);
                }
            }
            if (isRedirect === true && urlinfo['redirectCount'] === 1) {
                if (timeOuter) {
                    clearTimeout(timeOuter);
                }
                self.downloadIt(urlinfo, callback);
            }
    
            let compressed = /gzip|deflate/.test(res.headers['content-encoding']);
    
            let bufferHelper = new BufferHelper();
    
            //持续接收请求到的数据
            res.on('data', function (chunk) {
                bufferHelper.concat(chunk);
            });
    
            //当请求的数据完成后
            res.on('end', function () {
                if (timeOuter) {
                    clearTimeout(timeOuter);
                    timeOuter = false;
                }
                result["cost"] = (new Date()) - startTime;
                console.log(`{downloadItCost link^cost(ms)}|${pageLink}|${result.cost}`);
    
                let page_encoding = urlinfo['encoding'];
                let real_encoding = self.get_page_encoding(res.headers);
    
                if (real_encoding && real_encoding != '') {
                    page_encoding = real_encoding;
                }
                if (!page_encoding) {
                    page_encoding = 'utf-8';
                }
                console.log(`{downloadItChangeEncode realEncode}|${page_encoding}`);
                //标准化编码参数
                page_encoding = page_encoding.toLowerCase().trim().replace('\-', '');
    
                //无压缩
                if (!compressed || typeof unzip == 'undefined') {
                    if (urlinfo['binary'] === true) {
                        result["content"].push(bufferHelper.toBuffer());
                    } else {
                        result["content"].push(iconv.decode(bufferHelper.toBuffer(), page_encoding));
                    }
                    promise.resolve(result);
                } else {
                    let buf = bufferHelper.toBuffer();
                    unzip(buf, function (err, buff) {
                        if (!err && buff) {
                            if (urlinfo['binary'] === true) {
                                result["content"].push(buff);
                            } else {
                                result["content"].push(iconv.decode(buff, page_encoding));
                            }
                            promise.resolve(result);
                        } else {
                            log.debug("unzip error:" + err)
                            promise.reject("unzip failure");
                        }
                    });
                }
            });
        });
    
        //超时
        timeOuter = setTimeout(function () {
            if (req) {
                console.log(`{downloadItCost link^cost(ms)}|${pageLink}|${((new Date()) - startTime)}`);
                req.abort();
                req = null;
                promise.reject('download timeout');
            }
        }, self.download_timeout * 1000);
    
        //超时错误处理
        req.on('error', function (e) {
            console.log(`{downloadItError link^err}|${pageLink}|${e.message}`);
            if (timeOuter) {
                clearTimeout(timeOuter);
                timeOuter = null;
            }
            if (req) {
                req.abort();
                req = null;
                promise.reject('time out error');
            }
        });
        req.end();
    });
    promise.then(function(value){
        console.log('maybe successed!');
        promise.resolve(value);
    })
    .catch(function(error)
    {
        console.log('maybe failed!');
        console.error(error);
    });
    //return promise;
};

module.exports = downloader;



// downloader.prototype.downloadIt = function (urlinfo, callback) {
//     let self = this;
//     let timeOuter = null;
//     let pageLink = urlinfo['link'];
//     //初始状态没有这个字段 如果发生重定向会添加这这个字段
//     if (urlinfo['redirect']) pageLink = urlinfo['redirect'];
//     let urlobj;
//     try {
//         urlobj = urlUtil.parse(pageLink);
//     }
//     catch (err) {
//         return callback(err);
//     }

//     let __host = urlobj['hostname'];
//     let __port = urlobj['port'];
//     let __path = urlobj['path'];

//     let startTime = new Date();
//     let options = {
//         'host': __host,
//         'port': __port,
//         'path': __path,
//         'method': 'GET',
//         'headers': {
//             "User-Agent": 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.104 Safari/537.36 Core/1.53.3538.400 QQBrowser/9.6.12501.400',
//             "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//             "Accept-Encoding": "gzip",
//             "Accept-Language": "zh-CN,zh;q=0.8,en-US;q=0.6,en;q=0.4",
//             "Referer": urlinfo['referer'] || '',
//             "host": urlobj['host'],
//             "void-proxy": urlinfo['void_proxy'] ? urlinfo['void_proxy'] : "",
//             "Cookie": urlinfo['cookie'] ? urlinfo['cookie'] : ""
//         }
//     };
//     console.log('start download by normal downloader ' + __host + ' port:' + __port + ' path:' + __path + ' pagelink:' + pageLink);

//     let realDownloader = http;
//     if (pageLink.startsWith('https')) {
//         realDownloader = https;
//     }

//     let req = realDownloader.request(options, function (res) {
//         let result = {
//             "remote_proxy": res.headers['remoteproxy'],
//             "cookie": res.headers['Cookie'],
//             "originCode": res.statusCode,
//             "content": []
//         };

//         //http redirect;
//         let isRedirect = false;
//         if (parseInt(res.statusCode) == 301 || parseInt(res.statusCode) == 302 || parseInt(res.statusCode) == 303) {
//             if (res.headers['location']) {
//                 urlinfo['link'] = urlUtil.resolve(pageLink, res.headers['location']);
//                 if (urlinfo['redirectCount']) { //控制重定向次数
//                     urlinfo['redirectCount']++;
//                 } else {
//                     urlinfo['redirectCount'] = 1;
//                 }
//                 isRedirect = true;
//                 console.log(`downloadItRedirect to}|${res.headers['location']}`);
//             }
//         }
//         if (isRedirect === true && urlinfo['redirectCount'] === 1) {
//             if (timeOuter) {
//                 clearTimeout(timeOuter);
//             }
//             return self.downloadIt(urlinfo, callback);
//         }

//         let compressed = /gzip|deflate/.test(res.headers['content-encoding']);

//         let bufferHelper = new BufferHelper();

//         //持续接收请求到的数据
//         res.on('data', function (chunk) {
//             bufferHelper.concat(chunk);
//         });

//         //当请求的数据完成后
//         res.on('end', function () {
//             if (timeOuter) {
//                 clearTimeout(timeOuter);
//                 timeOuter = false;
//             }
//             result["cost"] = (new Date()) - startTime;
//             console.log(`{downloadItCost link^cost(ms)}|${pageLink}|${result.cost}`);

//             let page_encoding = urlinfo['encoding'];
//             let real_encoding = self.get_page_encoding(res.headers);

//             if (real_encoding && real_encoding != '') {
//                 page_encoding = real_encoding;
//             }
//             if (!page_encoding) {
//                 page_encoding = 'utf-8';
//             }
//             console.log(`{downloadItChangeEncode realEncode}|${page_encoding}`);
//             //标准化编码参数
//             page_encoding = page_encoding.toLowerCase().trim().replace('\-', '');

//             //无压缩
//             if (!compressed || typeof unzip == 'undefined') {
//                 if (urlinfo['binary'] === true) {
//                     result["content"].push(bufferHelper.toBuffer());
//                 } else {
//                     result["content"].push(iconv.decode(bufferHelper.toBuffer(), page_encoding));
//                 }
//                 return callback(null, result);
//             } else {
//                 let buf = bufferHelper.toBuffer();
//                 unzip(buf, function (err, buff) {
//                     if (!err && buff) {
//                         if (urlinfo['binary'] === true) {
//                             result["content"].push(buff);
//                         } else {
//                             result["content"].push(iconv.decode(buff, page_encoding));
//                         }
//                         return callback(null, result);
//                     } else {
//                         log.debug("unzip error:" + err)
//                         return callback("unzip failure");
//                     }
//                 });
//             }
//         });
//     });

//     timeOuter = setTimeout(function () {
//         if (req) {
//             console.log(`{downloadItCost link^cost(ms)}|${pageLink}|${((new Date()) - startTime)}`);
//             req.abort();
//             req = null;
//             return callback("download timeout");
//         }
//     }, self.download_timeout * 1000);

//     req.on('error', function (e) {
//         console.log(`{downloadItError link^err}|${pageLink}|${e.message}`);
//         if (timeOuter) {
//             clearTimeout(timeOuter);
//             timeOuter = null;
//         }
//         if (req) {
//             req.abort();
//             req = null;
//             return callback(e.message);
//         }
//     });
//     req.end();
// };

// module.exports = downloader;