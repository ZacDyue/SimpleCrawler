let Downloader = require('./downloader');
let fs = require('fs');

let downloader = new Downloader(20000);

let urlInfo = {
    //link : 'https://product.pconline.com.cn/dc/canon/571817_detail.html',
    link : 'https://product.pconline.com.cn/dc/s10.shtml',
    encoding : 'gbk',
}

Promise.resolve()

//找到商品页第一页 然后拿到第一页的html
downloader.downloadIt(urlInfo,function(err,res){

    let json_obj = JSON.parse(JSON.stringify(res));

    fs.writeFileSync('./out.html', json_obj.content);

    console.log(json_obj.originCode);
    console.log(json_obj.content);
    console.log('finish --- ');
});


var promise = new Promise(function(resolve){
    resolve(42);
});
promise.then(function(value){
    console.log(value);
}).catch(function(error){
    console.error(error);
});


console.log('hehehe');
