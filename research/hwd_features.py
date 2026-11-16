"""Handwriting Distance features (Pippi et al., BMVC 2023) for every image of a folder.

Runs in a separate environment with torch and the reference implementation (github.com/aimagelab/HWD):
    <venv>/bin/python research/hwd_features.py ROOT

Every sub-folder of ROOT that holds PNG images and no features.npz yet gets a features.npz.

HWD of two sets = Euclidean distance between the means of the per-column VGG-16 features (backbone trained on 10,400
synthetic handwriting fonts). Per image we store the sum and count of its feature columns, so that set means, and
bootstrap resamples of them, can be computed later without the network. Preprocessing as in hwd.scores.HWDScore.
"""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from hwd.datasets.transforms import Compose, PaddingSquareHeight, ResizeHeight, ToTensor
from hwd.metrics.backbones import VGG16Backbone
from hwd.scores import VGG16_10400_URL


def features(net, tf, files):
    sums, counts = [], []
    with torch.inference_mode():
        for f in files:
            x = tf(Image.open(f).convert('RGB')).unsqueeze(0)
            feats = net(x)                       # (1, columns, 512) after AdjustDims
            feats = feats.reshape(-1, feats.shape[-1])
            n = int(x.shape[-1] // 32) * int(x.shape[-2] // 32)
            feats = feats[:max(n, 1)]
            sums.append(feats.sum(0).numpy()); counts.append(len(feats))
    return np.array(sums), np.array(counts)


def main():
    root = Path(sys.argv[1])
    todo = [d for d in sorted(root.iterdir()) if d.is_dir() and not (d / 'features.npz').exists() and any(d.glob('*.png'))]
    if not todo:
        return
    tf = Compose([PaddingSquareHeight(), ResizeHeight(32), ToTensor()])
    net = VGG16Backbone(VGG16_10400_URL, num_classes=10400).model.eval()
    for d in todo:
        files = sorted(d.glob('*.png'))
        sums, counts = features(net, tf, files)
        np.savez(d / 'features.npz', names=np.array([f.name for f in files]), sums=sums, counts=counts)


if __name__ == '__main__':
    main()
