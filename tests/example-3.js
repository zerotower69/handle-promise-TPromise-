const TPromise = require('../src/TPromise');

let getResolve,getReject;
const p1 = new TPromise((resolve, reject)=>{
    getResolve = resolve;
    getReject = reject;
});

const p2=p1.then((value)=>{
    console.log('p1 value',value)
})
const p3 =p2.finally(()=>{
    console.log('p2 finally')
    return TPromise.reject(6)
});
const p4 = p3.then((value)=>{
    console.log('p3 value',value)
},(reason)=>{
    console.log('p3 reason',reason)
})

const p5= p4.then(value => {
    console.log('p4 value',value)
},reason => {
    console.log('p4 reason',reason)
})
const p6=p5.then((value)=>{
    console.log('p5 value',value)
},(reason)=>{
    console.log('p5 reason',reason)
})

// example 1:
getReject(5)
////// 期望：
// p2 finally
// p3 reason 6
// p4 value undefined
// p5 value undefined

/////结果：
// p2 finally
// p3 reason 6
// p4 value undefined
// p5 value undefined
