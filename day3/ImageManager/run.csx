using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.Primitives;

public static void Run(Stream inputBlob, Stream outputBlob, string name, ILogger log)
{
    log.LogInformation($"C# Blob trigger function Processed blob\n Name:{name} \n Size: {inputBlob.Length} Bytes");

    try
    {
        using(var image = Image.Load(inputBlob))
        {
            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(150, 150),
                Mode = ResizeMode.Crop
            })
            .Grayscale());

            using (var ms = new MemoryStream())
            {
                image.SaveAsPng(outputBlob);
            }
        }

        log.LogInformation("Image resized", null);
    }
    catch(Exception ex)
    {
        log.LogInformation(ex.Message, null);
    }
}