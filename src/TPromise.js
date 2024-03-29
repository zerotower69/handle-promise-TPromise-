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
            //真实的resolve函数
           function realResolveValue(value){
               if(that.status === 'pending'){
                   that.status='fulfilled';
                   that.value=value;
                   that.onFulfilledCallbacks.forEach(cb=>{
                       isFunc(cb) && cb(value)
                   })
               }
           }
           //如果value是一个Promise
           if(value instanceof TPromise){
               //*核心，调用then的逻辑又是一个微任务
               const microTask= ()=>{
                   value.then((newValue)=>{
                       resolve(newValue)
                   },newReason=>{
                       reject(newReason)
                   })
               }
               //送入微任务队列
               addMicroTask(microTask)
           } else if(isThenable(value)){
               //value是一个thenable对象，调用then方法，调用也是一个微任务
               const microTask = ()=>{
                   try{
                       value.then.call(value,newValue=>resolve(newValue),newReason=>reject(newReason))
                   } catch (e){
                       reject(e)
                   }
               }
               //加入微任务队列
               addMicroTask(microTask)
           } else{
               realResolveValue(value)
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

           //该方法在promise的状态变为fulfilled，也就是兑现后调用
           function fulfilledCallback(value){
               //在这个微任务中取出onFulFilled的执行结果，并解决循环依赖（A等A完成）,返回为thenable的情况，如捕获到报错或者异常
               //直接决拒绝这个此promise
               const microTask = ()=>{
                   try{
                       const result = onFulfilled(value);
                       resolvePromise(promise,result,resolve,reject)
                   } catch (e){
                       reject(e)
                   }
               }
               //任务送入微任务队列中
               addMicroTask(microTask)
           }
           //该方法在promise的状态变为rejected，也就是拒绝后调用
           function rejectedCallback(reason){
               //在这个微任务中取出onRejected的执行结果，并解决循环依赖（A等A完成）,返回为thenable的情况，如捕获到报错或者异常
               //直接决拒绝这个此promise
               const microTask = ()=>{
                   try{
                       const result = onRejected(reason);
                       resolvePromise(promise,result,resolve,reject)
                   } catch (e){
                       reject(e)
                   }
               };
               //送入微任务队列
               addMicroTask(microTask)
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
        //统一由resolve处理复杂情况
       return new TPromise((resolve,reject)=>{
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
     * @param {Iterable} values
     * @return {TPromise}
     */
    static all(values){
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
    }

    /**
     * 只要有一个promise fulfilled ==> fulfilled, 所有的rejected ==>rejected
     * @param {Iterable} values
     * @return {TPromise}
     */
    static any(values){
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

    /**
     * 一旦有一个响应则返回，返回状态依第一个响应而定
     * @param {Iterable} values
     * @return {TPromise}
     */
    static race(values){
        if(!isIterator(values)){
            throw new TypeError('values must be an iterable object.')
        }
        return new TPromise((resolve,reject)=>{
            //遍历下标
            let index =0;
            for(const value of values){
                //避免闭包问题
                let resultIndex = index;
                index++;
                TPromise.resolve(value).then((value)=>{
                    resolve(value)
                },(reason)=>{
                    reject(reason)
                });
            }
        })
    }

    /**
     * 只会fulfilled,需等待所有的promise完成
     * @param {Iterable} values
     * @return {TPromise}
     */
    static allSettled(values){
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

}

/**
 * 递归解决resolve中的value
 * @param promise
 * @param data
 * @param resolve
 * @param reject
 */
function resolvePromise(promise,data,resolve,reject){
    //*2.3.1
    if(data === promise){
       return reject(new TypeError('禁止循环引用'));
    }
    // 多次调用resolve或reject以第一次为主，忽略后边的,防止多次调用
    let called = false;
    //*2.3.2: 如果x是一个promise,以相同的方式完成兑现或者拒绝
    //*2.3.3.2 :如果检索then属性失败，使用失败原因拒绝
    //*2.3.3
    if(isObj(data) || isFunc(data)){
        try {
            const then = data.then;
            if (isFunc(then)) {
                //*2.3.3.3
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

            } else {
                resolve(data)
            }
        } catch (e){
            //*2.3.3.2: 检测data.then发生异常
            //*2.3.3.3.4 : 调用data.then发生异常
            if(called){
                //*2.3.3.3.4.1 resolve或者reject已经被调用忽略
                return
            }
            called=false
            //*2.3.3.3.4.2 拒绝
            reject(e)
        }
    } else{
        resolve(data)
    }
}

/**
 * 将一个任务回调送入微任务队列
 * @param {(...args:any[])=>any} taskCallback
 */
function addMicroTask(taskCallback){
    if(isFunc(taskCallback)){
        queueMicrotask(taskCallback)
    }
}

function isThenable(value){
     return !!((isObj(value) || isFunc(value)) && typeof value.then === 'function');
}

//判断一个值是不是函数
function isFunc(val){
    return typeof val === 'function'
}

//判断一个值是不是对象
function isObj(val){
    return typeof val ==='object' && val!==null
}

//判断一个值是不是可迭代对象
function isIterator(val){
   return typeof val[Symbol.iterator] === 'function'
}

module.exports = TPromise