export async function downloadStrip(dataUrl:string) {
  const blob=await fetch(dataUrl).then(response=>{
    if(!response.ok) throw new Error("Photo strip could not be prepared")
    return response.blob()
  })
  const objectUrl=URL.createObjectURL(blob)
  const anchor=document.createElement("a")
  anchor.href=objectUrl
  anchor.download=`duet-${Date.now()}.png`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1_000)
}
