//原型链版本的TPromise

const PENDING="pending"
const FULFILLED ="fulfilled"
const REJECTED ="rejected"

function TPromise(executor){
    if(!isFunc(executor)){
        throw new TypeError('executor 必须是一个函数')
    }
    this.status=PENDING;
    this.onFulfilledCallbacks=[];
    this.onRejectedCallbacks=[];
    this.value =(void 0);
    this.reason =(void 0);

    const that = this;
    function resolve(value){
        if(that.status === PENDING){
            that.status = FULFILLED;
            that.value=value;
            that.onFulfilledCallbacks.forEach((cb)=>{
                isFunc(cb) && cb.call(that,that.value)
            })
        }
    }

    function reject(reason){
        if(that.status === PENDING){
            that.status=REJECTED;
            that.reason =reason;
            that.onRejectedCallbacks.forEach((cb)=>{
                isFunc(cb) && cb.call(that,that.reason)
            })
        }
    }

    try{
        executor.call(that,resolve,reject)
    }
    catch (e){
        reject(e)
    }
}

TPromise.prototype.then=function(onFulfilled,onRejected){
    const that =this;
    const promise= new TPromise((resolve,reject)=>{
        onFulfilled = isFunc(onFulfilled)? onFulfilled:(value)=>value;
        onRejected = isFunc(onRejected)? onRejected:(reason)=>{throw reason};

        function onFulfilledCallback(value){
            queueMicrotask(()=>{
                try {
                    const result = onFulfilled(value);
                    resolvePromise(promise,result,resolve,reject)
                } catch (e){
                    reject(e)
                }
            })
        }
        function onRejectedCallback(reason){
            queueMicrotask(()=>{
                try {
                    const result = onRejected(reason);
                    resolvePromise(promise,result,resolve,reject)
                } catch (e){
                    reject(e)
                }
            })
        }

        switch (that.status){
            case FULFILLED:
                onFulfilledCallback(that.value);
                break
            case REJECTED:
                onRejectedCallback(that.reason);
                break;
            default:
                that.onFulfilledCallbacks.push(onFulfilledCallback);
                that.onRejectedCallbacks.push(onRejectedCallback);
        }
    });
    return promise;
}
TPromise.prototype.catch=function (onRejected){
    return this.then(null,onRejected);
}
TPromise.resolve=function (value){
    if(value instanceof TPromise){
        return value
    }
    return new TPromise((resolve)=>{
        resolve(value)
    })
};

TPromise.prototype.finally=function (onFinally){
    const P = this.constructor;
    return this.then(
        //这两个promise没有catch就会报错，然后被外层的捕获
        value=>P.resolve(onFinally()).then(()=>value,reason=>{
            throw reason
        }),
        reason=>P.resolve(onFinally()).then(()=>{
            throw reason
        },newReason=>{
            throw newReason
        })
    )
}

TPromise.reject =function (reason){
    return new TPromise((resolve,reject)=>{
        reject(reason)
    })
};

TPromise.all=function (values){
    //values不是一个可迭代对象就报错
    if(!isIterator(values)){
        throw new TypeError('values must be an iterable object.')
    }
    return new TPromise((resolve,reject)=>{
        //返回结果，all,values
        const results= [];
        //fulfilled 计数器
        let count =0;
        //遍历顺序
        let index =0;
        //使用 for...of遍历可迭代对象
        for(const value of values){
            //避免闭包问题
            let resultIndex = index;
            index++;
            const p = TPromise.resolve(value).then(value=>{
                //!在此保证最终返回的promise,在fulfilled时，所有的兑现值均按参数传递时的顺序
                results[resultIndex]= value;
                //fulfilled中统计次数，一旦count和传入的promises长度相等，就说明所有的promise均fulfilled了。
                count++
                if(count === index){
                    resolve(results)
                }
            },(reason)=>{
                reject(reason)
            });
        }
        if(index===0){
            //表示没有遍历，遍历对象为空
            resolve(results)
        }
    })
};

TPromise.any=function (values){
    if(!isIterator(values)){
        throw new TypeError('values must be an iterable object.')
    }
    return new TPromise((resolve,reject)=>{
        //结果，any ===> reasons
        const results= []
        //计数器，统计rejected 次数
        let count =0;
        //迭代时下标记录
        let index=0;
        for(const value of values){
            //避免闭包问题
            let resultIndex = index;
            index++;
            TPromise.resolve(value).then((value)=>{
                resolve(value)
            },reason=>{
                results[resultIndex]=reason;
                count++
                if(count === index){
                    reject(results)
                }
            });
        }
        //如果下标不变，说明迭代对象为空
        if(index===0){
            reject(results)
        }
    })
}

TPromise.race =function (values){
    if(!isIterator(values)){
        throw new TypeError('values must be an iterable object.')
    }
    return new TPromise((resolve)=>{
        const results = [];
        //计数器，兑现个数统计
        let count=0;
        //迭代下标
        let index=0;
        for(const value of values){
            //避免闭包问题
            let resultIndex = index;
            index++;
            TPromise.resolve(value).then((value)=>{
                //保证有序
                results[resultIndex]={
                    status:'fulfilled',
                    value:value
                };
                count++;
                if(count===index){
                    resolve(results)
                }
            },(reason)=>{
                //保证有序
                results[resultIndex]={
                    status:'rejected',
                    reason:reason
                };
                count++;
                if(count===index){
                    resolve(results)
                }
            });
        }
        //可迭代对象为空
        if(index===0){
            resolve(results)
        }
    })
}

TPromise.allSettled=function (values){
    //!不是数组报错
    if(!Array.isArray(promises)){
        throw new TypeError('promises must be array')
    }
    return new TPromise((resolve)=>{
        //传递空数组，直接fulfilled并短路
        if(promises.length === 0){
            return resolve([])
        }
        const results = new Array(promises.length);
        let count=0;
        for(let index in promises){
            //promise可能不是TPromise实例，用TPromise.resolve处理
            const promise = promises[index]
            TPromise.resolve(promise).then((value)=>{
                //保证有序
                results[index]={
                    status:'fulfilled',
                    value:value
                };
            },(reason)=>{
                //保证有序
                results[index]={
                    status:'rejected',
                    reason:reason
                }
            }).finally(()=>{
                //总要走到这里，干脆把count计数放这了
                //!但是放这里也是有问题的，由于then后返回一个新的promise,再finally后，此部分逻辑又进入到微任务队列，
                //!等同于多了一次微任务
                ++count;
                if(count === promises.length){
                    resolve(results)
                }
            })
        }
    })
}



/**
 * @param promise
 * @param data
 * @param resolve
 * @param reject
 */
function resolvePromise(promise,data,resolve,reject){
    if(data === promise){
        return reject(new TypeError('禁止循环引用'));
    }
    // 多次调用resolve或reject以第一次为主，忽略后边的
    let called = false
    if(((isObj(data)&& data!==null) || isFunc(data))){
        try{
            const then = data.then
            if(isFunc(then)) {
                then.call(data, (value) => {
                        if (called) {
                            return
                        }
                        called = true
                        //递归执行，避免value是一个PromiseLike,Promise.resolve中的嵌套thenable在这里解决。
                        resolvePromise(promise, value, resolve, reject)
                    }, (reason) => {
                        if (called) {
                            return
                        }
                        called = true
                        reject(reason)
                    }
                )
            } else{
                resolve(data)
            }
        } catch (e){
            if (called) {
                return
            }
            called = true
            reject(e)
        }
    } else{
        //data是null,undefined,普通引用值等
        resolve(data)
    }
}

//判断一个值是不是函数
function isFunc(val){
    return typeof val === 'function'
}

//判断一个值是不是对象
function isObj(val){
    return typeof val ==='object'
}

//判断一个值是不是可迭代对象
function isIterator(val){
    return typeof val[Symbol.iterator] === 'function'
}

module.exports=TPromise