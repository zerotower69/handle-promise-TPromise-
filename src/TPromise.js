/**
 * @typedef {(...args:any[])=>any} Callback
 */

class TPromise{
    /**
     * @private
     * @type {"pending"|"fulfilled"|"rejected"}
     */
   status
    /**
     * @private
     */
    value
    /**
     * @private
     */
    reason
    /**
     * @private
     * @type {Callback[]}
     */
   onFulfilledCallbacks
    /**
     * @private
     * @type {Callback[]}
     */
   onRejectedCallbacks
    constructor(executor) {
       const that = this;
        this.status = "pending"
        this.onFulfilledCallbacks=[];
        this.onRejectedCallbacks=[];

        if(typeof executor !== 'function'){
            throw TypeError('executor 必须是函数')
        }
        //分别构建resolve和reject函数传入
       function resolve(value){
            if(that.status === 'pending'){
                //只有pending时进入
                that.status='fulfilled';
                that.value=value;
                that.onFulfilledCallbacks.forEach(cb=>{
                    isFunc(cb) && cb(value)
                })
            }
        }
        function reject(reason){
            if(that.status === 'pending'){
                that.status='rejected'
                that.reason =reason;
                that.onRejectedCallbacks.forEach(cb=>{
                    isFunc(cb) && cb(reason)
                })
            }
        }

        //如果executor抛出异常，直接reject掉
        try{
            executor.call(that,resolve,reject)
        } catch (e){
            reject(e)
        }
    }

    /**
     * 核心部分实现，微任务部分通过queueMicroTask() API实现
     * @param onFulfilled
     * @param onRejected
     * @return {TPromise}
     */
    then(onFulfilled,onRejected){
       const that=this;
       //不给对应的回调就把value和reason持续地向下传递
       onFulfilled = isFunc(onFulfilled)? onFulfilled :(value)=>value;
       onRejected = isFunc(onRejected)? onRejected:(reason)=>{
           throw reason
       };
       const promise= new TPromise(function(resolve,reject){
           //由上一个promise的状态决定新的promise是否立刻调用

           //方法封装
           //! 以下微任务也就是两个步骤，执行回调取值，得出结果就进一步判断结果的值的类型情况进一步兑现新创建的promise,
           //! 如果捕获到错误就直接reject
           function fulfilledCallback(value){
               queueMicrotask(()=>{
                   //!这里的逻辑块就是微任务
                   try{
                       const result = onFulfilled(value);
                       resolvePromise(promise,result,resolve,reject)
                   } catch (e){
                       reject(e)
                   }
               })
           }
           function rejectedCallback(reason){
               queueMicrotask(()=>{
                   //!这里的逻辑块就是微任务
                   try{
                       const result = onRejected(reason);
                       resolvePromise(promise,result,resolve,reject)
                   } catch (e){
                       reject(e)
                   }
               })
           }
           switch (that.status){
               //同步情况：调用queueMicroTask本身这个操作是同步的
               case 'fulfilled':
                   fulfilledCallback(that.value);
                   break;
               //同步情况
               case 'rejected':
                   rejectedCallback(that.reason);
                   break;
               default:
               {
                   //pending 状态，就是连微任务队列都没进，先暂存进入回调数组，
                   //待pending状态改变后再进入微任务队列中排队
                   //! 这里应用了发布订阅的设计模式
                   that.onFulfilledCallbacks.push(fulfilledCallback);
                   that.onRejectedCallbacks.push(rejectedCallback)
               }
           }
       });
       return promise
    }

    /**
     * catch方法其实是then方法的语法糖：then(null,onRejected)
     * @param onRejected
     * @return {TPromise}
     */
    catch(onRejected){
       return this.then(null,onRejected)
    }

    /**
     * 不会改变链式传递过程中的 value和reason,除非显式地在回调中抛出错误或者返回一个rejected状态的promise
     * @param onFinally
     * @return {TPromise}
     */
    finally(onFinally){
        //!假定 result = onFinally()
        //! 使用 throw语句的原因在于我们只有在 try{} catch(e){ reject(e)} 的catch部分才会调用reject(),
        //!也就是说，reason先被catch（捕获）才会被reject调用在promise中链式传递，finally不会处理
        //!reason会让其继续传递，因此必须使用 throw 语句继续将其抛出，等待下游的try{} catch(e){} 将其再次捕获
        //之所以用TPromise.resolve,是由于onFinally()的结果可能是Promise,必须等待其兑现此时的promise
       return this.then(
           //这个value为 pr.finally() 这个pr 的 fulfilled 状态下的value，它将不受result的影响传递下去
           value=>TPromise.resolve(onFinally()).then(()=>value,
                   //这个reason为onFinally 显示指定一个 rejected的promise而产生，并传递下去
                   reason=>{throw reason}),
           //这个reason 为 pr.finally() 这个pr 的 rejected状态下的 reason,只要 result不是一个rejected状态的promise,它将接着传递下去
           (reason)=>TPromise.resolve(onFinally()).then(()=>{
               throw reason
           },(reason)=>{
               throw reason
           })
           )
    }

    /**
     * 该方法是返回一个新的promise，而传入的value可能有三种情况
     * * 本身是一个promise或者是promise的子类
     * * 是一个thenable对象
     * * 其它：undefined|null|object(非thenable)
     * @param {any|undefined} value
     */
    static resolve(value){
        //!1.如果value是promise直接返回
        if(value instanceof TPromise){
            return value
        }
       return new TPromise((resolve)=>{
           //thenable的情况实际上通过 resolvePromise完成了
           resolve(value)
       })
    }

    /**
     * 返回一个已拒绝（rejected）的 Promise 对象
     * 与Promise.resolve()不同，即使reason也是一个promise，也会将其视为被rejected的原因
     * @param {any} reason
     * @return {TPromise}
     */
    static reject(reason){
        //静态reject就是实例化后马上reject掉
        return new TPromise((resolve,reject)=>{
            reject(reason)
        })
    }

    /**
     * 等待所有的promise: all fulfilled=>fulfilled,  any rejected ==>rejected
     * @param promises
     * @return {TPromise}
     */
    static all(promises){
        //参数不是数组报错
        if(!Array.isArray(promises)){
            throw new TypeError('promises must be array')
        }
        return new TPromise((resolve,reject)=>{
            //传递空数组情况下直接fulfilled 并短路
            if(promises.length ===0){
                return resolve([]);
            }
            const results= new Array(promises.length);
            let count =0;
            for(let index in promises){
                const promise = promises[index];
                const p = TPromise.resolve(promise).then(value=>{
                    //!在此保证最终返回的promise,在fulfilled时，所有的兑现值均按参数传递时的顺序
                    results[index]= value;
                    //fulfilled中统计次数，一旦count和传入的promises长度相等，就说明所有的promise均fulfilled了。
                    count++
                    if(count === promises.length){
                        resolve(results)
                    }
                },(reason)=>{
                    reject(reason)
                })
            }
        })
    }

    /**
     * 只要有一个promise fulfilled ==> fulfilled, 所有的rejected ==>rejected
     * @param promises
     * @return {TPromise}
     */
    static any(promises){
        if(!Array.isArray(promises)){
            throw new TypeError('promises must be array')
        }
        return new TPromise((resolve,reject)=>{
            if(promises.length ===0){
                return resolve([])
            }
            const results= new Array(promises.length);
            let count =0
            for(let index of promises){
                const promise = promises[index]
                TPromise.resolve(promise).then((value)=>{
                    resolve(value)
                },reason=>{
                    results[index]=reason;
                    count++
                    if(count === promises.length){
                        reject(results)
                    }
                })
            }
        })
    }

    /**
     * 一旦有一个响应则返回，返回状态依第一个响应而定
     * @param promises
     * @return {TPromise}
     */
    static race(promises){
        if(!Array.isArray(promises)){
            throw new TypeError('promises must be array')
        }
        return new TPromise((resolve,reject)=>{
            for(const promise of promises){
                TPromise.resolve(promise).then((value)=>{
                    resolve(value)
                },(reason)=>{
                    reject(reason)
                })
            }
        })
    }

    /**
     * 只会fulfilled,需等待所有的promise完成
     * @param promises
     * @return {TPromise}
     */
    static allSettled(promises){
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

function isFunc(val){
    return typeof val === 'function'
}

function isObj(val){
    return typeof val ==='object'
}

module.exports = TPromise