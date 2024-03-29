async function asy1(){
    console.log(1);
    await asy2();
    console.log(2);
}

const asy2 = async ()=>{
    await setTimeout(()=>{
        Promise.resolve().then(()=>{
            console.log(3)
        });
        console.log(4);
    },0)
};

const asy3 = async ()=>{
    Promise.resolve().then(()=>{
        console.log(6);
    })
}

asy1();
console.log(7);
asy3();

//output: 1、7、6、2、4、3