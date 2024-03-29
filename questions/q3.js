new Promise(resolve=>{
    const resolvedPromise=Promise.resolve()
    resolve(resolvedPromise)
}).then(()=>{
    console.log('resolved promise')
})

Promise.resolve()
    .then(()=>{
        console.log('promise1')
    })
    .then(()=>{
        console.log('promise2')
    })
    .then(()=>{
        console.log('promise3')
    })
//output:
// promise1
// promise2
// resolved promise
// promise3